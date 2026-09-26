"""Zentrale Servo-Ansteuerung: Rampen, Stromgruppen-Limit, Soft-Start, Entspannen.

Alle Servobewegungen laufen über diese Klasse. Sie fährt Zielwinkel nie
sprunghaft an, sondern interpoliert mit begrenzter Geschwindigkeit im Takt
`update_hz`. Pro Spannungsgruppe dürfen höchstens `max_moving_servos` Servos
gleichzeitig fahren; weitere Aufträge warten in Auftragsreihenfolge.

Hinweis zum Limit: Auch haltende Servos ziehen unter Last Strom. Das Limit
begrenzt die Anlaufspitzen durch Bewegung, nicht den Haltestrom.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Callable, Iterable, Mapping

from .command_log import ServoCommandLog
from .config import HexapodConfig
from .pca9685 import PWMDriver
from .servo import Servo

ANGLE_EPS = 1e-6


class ServoNotActiveError(RuntimeError):
    """Servo ist entspannt; seine Ist-Position ist unbekannt (keine Rückmeldung).

    Er muss erst per `activate()`/`soft_start()` einen definierten ersten Puls
    bekommen, bevor Rampen möglich sind.
    """


@dataclass
class _ServoState:
    servo: Servo
    current: float | None = None  # None = entspannt, Position unbekannt
    target: float | None = None
    speed: float = 0.0
    seq: int = 0                  # Auftragsreihenfolge fürs Warten auf einen Slot
    has_slot: bool = False

    @property
    def pending(self) -> bool:
        return (self.current is not None and self.target is not None
                and abs(self.target - self.current) > ANGLE_EPS)


class ServoController:
    def __init__(self, cfg: HexapodConfig, drivers: Mapping[str, PWMDriver],
                 log: ServoCommandLog, *, sleep: Callable[[float], None] = time.sleep):
        missing = set(cfg.boards) - set(drivers)
        if missing:
            raise ValueError(f"Kein Treiber für Board(s): {sorted(missing)}")
        self.cfg = cfg
        self._drivers = drivers
        self._log = log
        self._sleep = sleep
        self._lock = threading.RLock()
        self._seq = 0
        self._states = {
            name: _ServoState(Servo(scfg, cfg.offsets_deg.get(name, 0.0)))
            for name, scfg in cfg.servos.items()
        }
        self._thread: threading.Thread | None = None
        self._running = threading.Event()
        self._error: BaseException | None = None

    # ---- Abfragen ---------------------------------------------------------

    @property
    def names(self) -> list[str]:
        return list(self._states)

    def servo(self, name: str) -> Servo:
        return self._state(name).servo

    def position(self, name: str) -> float | None:
        """Zuletzt kommandierter Winkel (nicht gemessen!), None = entspannt."""
        with self._lock:
            return self._state(name).current

    def target(self, name: str) -> float | None:
        with self._lock:
            return self._state(name).target

    def is_active(self, name: str) -> bool:
        return self.position(name) is not None

    def is_moving(self, names: Iterable[str] | None = None) -> bool:
        with self._lock:
            return any(self._state(n).pending for n in (names or self._states))

    def moving_count(self, group: str) -> int:
        with self._lock:
            return sum(1 for s in self._states.values()
                       if s.has_slot and s.servo.cfg.power_group == group)

    # ---- Befehle -----------------------------------------------------------

    def activate(self, name: str, angle: float) -> None:
        """Erster Puls für einen entspannten Servo. ACHTUNG: Das ist ein Sprung
        von der unbekannten Ist-Position auf `angle`. Normalerweise nur über
        soft_start() verwenden."""
        with self._lock:
            st = self._state(name)
            if st.current is not None:
                raise RuntimeError(f"{name} ist bereits aktiv")
            self._write(st, angle, kind="ACTIVATE")
            st.current = st.target = angle

    def set_target(self, name: str, angle: float, speed: float | None = None) -> None:
        with self._lock:
            st = self._state(name)
            if st.current is None:
                raise ServoNotActiveError(f"{name} ist entspannt; erst soft_start()/activate()")
            st.servo.check_angle(angle)
            limit = st.servo.cfg.max_speed_deg_s
            if speed is None:
                speed = limit
            if not 0 < speed <= limit:
                raise ValueError(f"{name}: Geschwindigkeit {speed}°/s außerhalb (0, {limit}]")
            was_pending = st.pending
            st.target = float(angle)
            st.speed = float(speed)
            if st.pending and not was_pending and not st.has_slot:
                self._seq += 1
                st.seq = self._seq
            self._log.event("TARGET", servo=name, angle=float(angle), speed=float(speed))

    def set_offset(self, name: str, offset_deg: float) -> None:
        """Kalibrierungs-Offset ändern. Ein aktiver Servo wird sofort mit dem
        neuen Offset nachgestellt (Sprung um die Offset-Differenz — beim
        Kalibrieren in kleinen Schritten ändern)."""
        with self._lock:
            st = self._state(name)
            st.servo.set_offset(offset_deg)
            self._log.event("OFFSET", servo=name, offset=float(offset_deg))
            if st.current is not None:
                self._write(st, st.current)

    def relax(self, names: Iterable[str] | None = None) -> None:
        """PWM abschalten: Servos werden kraftlos (Beine sacken unter Last ab!)."""
        with self._lock:
            for name in list(names or self._states):
                st = self._state(name)
                cfg = st.servo.cfg
                self._drivers[cfg.board].set_off(cfg.channel)
                st.current = st.target = None
                st.has_slot = False
                self._log.event("RELAX", servo=name, out=f"{cfg.board}:{cfg.channel}")

    def soft_start(self, names: Iterable[str] | None = None) -> None:
        """Entspannte Servos einzeln aktivieren und langsam in die Mittelstellung fahren."""
        names = list(names or self._states)
        rest = self.cfg.startup.assumed_rest_pose
        for name in names:
            if self.is_active(name):
                continue
            joint = name.split(".", 1)[1]
            initial = rest[joint] if (rest and not name.startswith("gripper.")) else 0.0
            self.servo(name).check_angle(initial)
            self.activate(name, initial)
            self._sleep(self.cfg.startup.activation_delay_s)
        for name in names:
            speed = min(self.cfg.startup.speed_deg_s, self.servo(name).cfg.max_speed_deg_s)
            self.set_target(name, 0.0, speed=speed)
        self.wait_until_idle()

    # ---- Takt --------------------------------------------------------------

    def step(self, dt: float) -> None:
        """Einen Interpolationsschritt ausführen (vom Hintergrund-Thread oder Tests)."""
        with self._lock:
            by_group: dict[str, list[_ServoState]] = {g: [] for g in self.cfg.power_groups}
            for st in self._states.values():
                by_group[st.servo.cfg.power_group].append(st)
            for group, states in by_group.items():
                limit = self.cfg.power_groups[group]
                for st in states:
                    if st.has_slot and not st.pending:
                        st.has_slot = False
                used = sum(1 for st in states if st.has_slot)
                waiting = sorted((st for st in states if st.pending and not st.has_slot),
                                 key=lambda s: s.seq)
                for st in waiting[:max(0, limit - used)]:
                    st.has_slot = True
                for st in states:
                    if not (st.has_slot and st.pending):
                        continue
                    delta = st.target - st.current
                    max_step = st.speed * dt
                    new = st.target if abs(delta) <= max_step else st.current + max_step * (1 if delta > 0 else -1)
                    self._write(st, new)
                    st.current = new
                    if not st.pending:
                        st.has_slot = False

    def start(self) -> None:
        if self._thread is not None:
            return
        self._running.set()
        self._thread = threading.Thread(target=self._run, name="servo-controller", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running.clear()
        if self._thread is not None:
            self._thread.join(timeout=2)
            self._thread = None

    def wait_until_idle(self, timeout: float | None = None,
                        names: Iterable[str] | None = None) -> bool:
        """Warten, bis alle (bzw. die genannten) Servos ihr Ziel erreicht haben.

        Läuft kein Hintergrund-Thread, wird der Takt hier synchron ausgeführt
        (für Tests und Skripte ohne Thread)."""
        names = list(names) if names is not None else None
        dt = 1.0 / self.cfg.update_hz
        waited = 0.0
        while self.is_moving(names):
            if self._error is not None:
                raise RuntimeError("Servo-Thread abgebrochen") from self._error
            if timeout is not None and waited >= timeout:
                return False
            if self._thread is None:
                self.step(dt)
            else:
                time.sleep(dt)
            waited += dt
        return True

    def _run(self) -> None:
        dt = 1.0 / self.cfg.update_hz
        last = time.monotonic()
        next_tick = last
        try:
            while self._running.is_set():
                now = time.monotonic()
                # Bei Verzögerung (z. B. Last auf dem Pi) nicht mit großem dt
                # nachholen — das wäre ein Sprung. Maximal 2 Takte am Stück.
                self.step(min(now - last, 2 * dt))
                last = now
                next_tick += dt
                pause = next_tick - time.monotonic()
                if pause > 0:
                    time.sleep(pause)
                else:
                    next_tick = time.monotonic()
        except BaseException as exc:  # I2C-Fehler etc.: nicht still weiterlaufen
            self._error = exc
            self._log.event("ERROR", error=repr(exc))
            self._running.clear()

    # ---- intern -----------------------------------------------------------

    def _state(self, name: str) -> _ServoState:
        try:
            return self._states[name]
        except KeyError:
            raise KeyError(f"Unbekannter Servo '{name}'") from None

    def _write(self, st: _ServoState, angle: float, kind: str = "PWM") -> None:
        cfg = st.servo.cfg
        pulse = st.servo.pulse_us(angle)
        self._drivers[cfg.board].set_pulse_us(cfg.channel, pulse)
        self._log.event(kind, servo=cfg.name, out=f"{cfg.board}:{cfg.channel}",
                        angle=float(angle), pulse_us=float(pulse))
