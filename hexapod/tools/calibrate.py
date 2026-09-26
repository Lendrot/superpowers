#!/usr/bin/env python3
"""Interaktives Kalibrierungstool: ein Bein manuell durchfahren, Offsets setzen.

    python3 tools/calibrate.py            # echte Hardware
    python3 tools/calibrate.py --sim      # ohne Hardware (Trockenlauf)

Ablauf zum Kalibrieren eines Gelenks:
  1. Roboter aufbocken, sodass die Beine frei hängen.
  2. `leg R1` wählt das Bein und fährt es per Soft-Start in die Mittelstellung.
  3. `joint femur` wählt das Gelenk.
  4. `trim +1` / `trim -0.5` verschiebt den Nullpunkt, bis das Gelenk mechanisch
     genau in der gewünschten Mittelstellung steht.
  5. `sweep` fährt das Gelenk langsam über den konfigurierten Bereich.
  6. `save` schreibt alle Offsets nach config/calibration.yaml.
"""

from __future__ import annotations

import argparse
import cmd
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from hardware import JointLimitError, Leg, ServoNotActiveError, build_controller, load_config  # noqa: E402
from hardware.config import LEG_NAMES, save_calibration  # noqa: E402


class CalibrationShell(cmd.Cmd):
    intro = ("Hexapod-Kalibrierung. 'help' zeigt alle Befehle.\n"
             "ACHTUNG: Roboter aufbocken — beim Entspannen sacken die Beine ab.")

    def __init__(self, controller, calibration_path: Path, default_step: float):
        super().__init__()
        self.ctl = controller
        self.calibration_path = calibration_path
        self.step_deg = default_step
        self.leg: Leg | None = None
        self.joint = "coxa"
        self.dirty = False
        self._update_prompt()

    # ---- Hilfen -------------------------------------------------------------

    def _update_prompt(self) -> None:
        where = f"{self.leg.name}.{self.joint}" if self.leg else "-"
        self.prompt = f"calib[{where}]> "

    def _servo_name(self) -> str | None:
        if self.leg is None:
            print("Erst ein Bein wählen: leg R1")
            return None
        return self.leg.servo_name(self.joint)

    def _move(self, name: str, angle: float) -> None:
        try:
            self.ctl.set_target(name, angle)
        except (JointLimitError, ServoNotActiveError, ValueError) as exc:
            print(f"Abgelehnt: {exc}")
            return
        self.ctl.wait_until_idle(names=[name])
        self._show(name)

    def _show(self, name: str) -> None:
        servo = self.ctl.servo(name)
        pos = self.ctl.position(name)
        c = servo.cfg
        if pos is None:
            print(f"{name}: entspannt | Offset {servo.offset_deg:+.2f}°")
        else:
            print(f"{name}: {pos:+7.2f}°  Puls {servo.pulse_us(pos):7.1f} µs  "
                  f"Offset {servo.offset_deg:+.2f}°  Grenzen [{c.min_deg}, {c.max_deg}]  "
                  f"{c.board}:{c.channel}")

    @staticmethod
    def _float(arg: str) -> float | None:
        try:
            return float(arg)
        except ValueError:
            print(f"Zahl erwartet, bekommen: {arg!r}")
            return None

    # ---- Befehle ------------------------------------------------------------

    def do_leg(self, arg: str) -> None:
        """leg <R1|R2|R3|L1|L2|L3> — Bein wählen und per Soft-Start in Mittelstellung fahren."""
        name = arg.strip().upper()
        if name not in LEG_NAMES:
            print(f"Unbekanntes Bein. Erlaubt: {', '.join(LEG_NAMES)}")
            return
        self.leg = Leg(name, self.ctl)
        print(f"Soft-Start {name} (Servos einzeln nacheinander) ...")
        self.leg.soft_start()
        self._update_prompt()
        self.do_status("")

    def do_joint(self, arg: str) -> None:
        """joint <coxa|femur|tibia> — Gelenk wählen (Hüfte/Oberschenkel/Unterschenkel)."""
        joint = arg.strip().lower()
        if joint not in Leg.JOINTS:
            print(f"Unbekanntes Gelenk. Erlaubt: {', '.join(Leg.JOINTS)}")
            return
        self.joint = joint
        self._update_prompt()

    def do_status(self, arg: str) -> None:
        """status — Stellung, Puls und Offset aller Gelenke des gewählten Beins."""
        if self.leg is None:
            print("Kein Bein gewählt.")
            return
        for name in self.leg.servo_names:
            self._show(name)

    def do_go(self, arg: str) -> None:
        """go <Grad> — gewähltes Gelenk langsam auf Winkel fahren."""
        name = self._servo_name()
        angle = self._float(arg)
        if name and angle is not None:
            self._move(name, angle)

    def do_step(self, arg: str) -> None:
        """step <Grad> — Schrittweite für '+' und '-' setzen."""
        value = self._float(arg)
        if value is not None and value > 0:
            self.step_deg = value
            print(f"Schrittweite {value}°")

    def do_plus(self, arg: str) -> None:
        """+ — gewähltes Gelenk um eine Schrittweite weiter."""
        self._nudge(+1)

    def do_minus(self, arg: str) -> None:
        """- — gewähltes Gelenk um eine Schrittweite zurück."""
        self._nudge(-1)

    def _nudge(self, sign: int) -> None:
        name = self._servo_name()
        if name is None:
            return
        pos = self.ctl.position(name)
        if pos is None:
            print(f"{name} ist entspannt. 'leg {self.leg.name}' aktiviert es wieder.")
            return
        self._move(name, pos + sign * self.step_deg)

    def default(self, line: str) -> None:
        if line.strip() == "+":
            return self.do_plus("")
        if line.strip() == "-":
            return self.do_minus("")
        print(f"Unbekannter Befehl: {line!r} ('help' für Hilfe)")

    def do_trim(self, arg: str) -> None:
        """trim <±Grad> — Nullpunkt-Offset des gewählten Servos verschieben."""
        name = self._servo_name()
        delta = self._float(arg)
        if name is None or delta is None:
            return
        new = self.ctl.servo(name).offset_deg + delta
        try:
            self.ctl.set_offset(name, new)
        except JointLimitError as exc:
            print(f"Abgelehnt: {exc}")
            return
        self.dirty = True
        self._show(name)

    def do_sweep(self, arg: str) -> None:
        """sweep — gewähltes Gelenk langsam min -> max -> 0 fahren."""
        name = self._servo_name()
        if name is None:
            return
        c = self.ctl.servo(name).cfg
        for angle in (c.min_deg, c.max_deg, 0.0):
            print(f"  -> {angle:+.1f}°")
            self._move(name, angle)

    def do_legsweep(self, arg: str) -> None:
        """legsweep — alle drei Gelenke des Beins nacheinander durchfahren."""
        if self.leg is None:
            print("Kein Bein gewählt.")
            return
        keep = self.joint
        for joint in Leg.JOINTS:
            self.joint = joint
            print(f"{self.leg.name}.{joint}:")
            self.do_sweep("")
        self.joint = keep

    def do_center(self, arg: str) -> None:
        """center — alle Gelenke des gewählten Beins auf 0° fahren."""
        if self.leg is None:
            print("Kein Bein gewählt.")
            return
        for name in self.leg.servo_names:
            self._move(name, 0.0)

    def do_relax(self, arg: str) -> None:
        """relax — PWM des gewählten Beins abschalten (Bein sackt ab!)."""
        if self.leg is not None:
            self.leg.relax()
            print(f"{self.leg.name} entspannt.")

    def do_save(self, arg: str) -> None:
        """save — alle Offsets nach calibration.yaml schreiben."""
        offsets = {n: self.ctl.servo(n).offset_deg for n in self.ctl.names}
        save_calibration(self.calibration_path, offsets)
        self.dirty = False
        print(f"Gespeichert: {self.calibration_path}")

    def do_quit(self, arg: str) -> bool:
        """quit — alle Servos entspannen und beenden."""
        if self.dirty:
            answer = input("Ungespeicherte Offsets. Trotzdem beenden? [j/N] ")
            if answer.strip().lower() not in ("j", "ja", "y", "yes"):
                return False
        return True

    do_exit = do_quit
    do_EOF = do_quit


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", type=Path, default=ROOT / "config" / "hexapod.yaml")
    parser.add_argument("--calibration", type=Path, default=ROOT / "config" / "calibration.yaml")
    parser.add_argument("--sim", action="store_true", help="ohne Hardware (simulierte PCA9685)")
    parser.add_argument("--step", type=float, default=2.0, help="Schrittweite für +/- in Grad")
    args = parser.parse_args()

    cfg = load_config(args.config, args.calibration)
    ctl = build_controller(cfg, simulate=args.sim)
    ctl.start()
    try:
        CalibrationShell(ctl, args.calibration, args.step).cmdloop()
    except KeyboardInterrupt:
        print()
    finally:
        ctl.stop()
        ctl.relax()
    return 0


if __name__ == "__main__":
    sys.exit(main())
