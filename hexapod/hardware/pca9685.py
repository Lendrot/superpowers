"""PCA9685-Treiber (direkt über I2C-Register) und eine Simulation ohne Hardware.

Bewusst ohne Adafruit-Stack: nur smbus2, damit das Verhalten beim Start
(insbesondere: Ausgänge NICHT zurücksetzen) vollständig kontrolliert ist.
"""

from __future__ import annotations

import time
from typing import Protocol

MODE1 = 0x00
MODE2 = 0x01
LED0_ON_L = 0x06
PRESCALE = 0xFE

MODE1_RESTART = 0x80
MODE1_AI = 0x20      # Auto-Increment
MODE1_SLEEP = 0x10
MODE2_OUTDRV = 0x04  # Totem-Pole-Ausgang
FULL_OFF_BIT = 0x10  # in LEDn_OFF_H


class PWMDriver(Protocol):
    def set_pulse_us(self, channel: int, pulse_us: float) -> None: ...
    def set_off(self, channel: int) -> None: ...
    def close(self) -> None: ...


def prescale_for(frequency_hz: float, oscillator_hz: float) -> int:
    value = round(oscillator_hz / (4096 * frequency_hz)) - 1
    if not 3 <= value <= 255:
        raise ValueError(f"PWM-Frequenz {frequency_hz} Hz mit Oszillator {oscillator_hz} Hz "
                         f"nicht darstellbar (prescale={value})")
    return value


class PCA9685:
    """Echter Treiber. Benötigt `smbus2` und aktiviertes I2C."""

    def __init__(self, address: int, *, bus: int, frequency_hz: float, oscillator_hz: float):
        try:
            from smbus2 import SMBus
        except ImportError as exc:  # pragma: no cover - nur auf dem Pi relevant
            raise RuntimeError("smbus2 ist nicht installiert: pip install smbus2") from exc
        self.address = address
        self._bus = SMBus(bus)
        prescale = prescale_for(frequency_hz, oscillator_hz)
        # Tatsächliche Tick-Dauer aus dem Prescaler, nicht aus der Wunschfrequenz —
        # sonst stimmen die Pulsbreiten um den Rundungsfehler nicht.
        self._tick_us = (prescale + 1) / oscillator_hz * 1e6
        self._configure(prescale)

    def _configure(self, prescale: int) -> None:
        # Kanäle werden hier absichtlich NICHT zurückgesetzt: Wenn das Board noch
        # von einem vorherigen Lauf Pulse ausgibt, halten die Servos ihre Position.
        # Nach dem Einschalten des Boards sind alle Kanäle laut Datenblatt "full off".
        self._write(MODE2, MODE2_OUTDRV)
        mode1 = self._read(MODE1)
        if self._read(PRESCALE) != prescale:
            # Prescaler nur im Sleep schreibbar; im Sleep fallen die Ausgänge kurz
            # aus. Deshalb nur, wenn wirklich nötig.
            self._write(MODE1, (mode1 & ~MODE1_RESTART) | MODE1_SLEEP)
            self._write(PRESCALE, prescale)
        self._write(MODE1, (mode1 & ~MODE1_SLEEP & ~MODE1_RESTART) | MODE1_AI)
        time.sleep(0.001)  # Oszillator braucht max. 500 µs
        if self._read(MODE1) & MODE1_RESTART:
            self._write(MODE1, (mode1 & ~MODE1_SLEEP) | MODE1_AI | MODE1_RESTART)

    def _write(self, reg: int, value: int) -> None:
        self._bus.write_byte_data(self.address, reg, value & 0xFF)

    def _read(self, reg: int) -> int:
        return self._bus.read_byte_data(self.address, reg)

    def set_pulse_us(self, channel: int, pulse_us: float) -> None:
        ticks = round(pulse_us / self._tick_us)
        if not 0 < ticks < 4096:
            raise ValueError(f"Puls {pulse_us} µs außerhalb des darstellbaren Bereichs")
        self._bus.write_i2c_block_data(self.address, LED0_ON_L + 4 * channel,
                                       [0, 0, ticks & 0xFF, ticks >> 8])

    def set_off(self, channel: int) -> None:
        self._bus.write_i2c_block_data(self.address, LED0_ON_L + 4 * channel,
                                       [0, 0, 0, FULL_OFF_BIT])

    def close(self) -> None:
        self._bus.close()


class SimulatedPCA9685:
    """Merkt sich nur die zuletzt geschriebenen Pulse. Für Tests und Trockenläufe."""

    def __init__(self, address: int = 0):
        self.address = address
        self.pulses: dict[int, float | None] = {}
        self.writes: list[tuple[int, float | None]] = []

    def set_pulse_us(self, channel: int, pulse_us: float) -> None:
        self.pulses[channel] = pulse_us
        self.writes.append((channel, pulse_us))

    def set_off(self, channel: int) -> None:
        self.pulses[channel] = None
        self.writes.append((channel, None))

    def close(self) -> None:
        pass
