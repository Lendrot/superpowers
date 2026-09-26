"""Umrechnung Gelenkwinkel -> Pulsbreite für einen einzelnen Servo."""

from __future__ import annotations

from .config import ServoConfig


class JointLimitError(ValueError):
    """Ein Zielwinkel liegt außerhalb der konfigurierten Gelenkgrenzen.

    Wird bewusst geworfen statt zu begrenzen: Ein stillschweigend gekappter
    Winkel würde später z. B. Fehler in der Kinematik verdecken.
    """


class Servo:
    def __init__(self, cfg: ServoConfig, offset_deg: float = 0.0):
        self.cfg = cfg
        self.offset_deg = 0.0
        self.set_offset(offset_deg)

    @property
    def name(self) -> str:
        return self.cfg.name

    def set_offset(self, offset_deg: float) -> None:
        if abs(offset_deg) > self.cfg.max_offset_deg:
            raise JointLimitError(f"{self.name}: Offset {offset_deg}° > max_offset_deg "
                                  f"{self.cfg.max_offset_deg}°")
        self.offset_deg = float(offset_deg)

    def check_angle(self, angle_deg: float) -> None:
        if not self.cfg.min_deg <= angle_deg <= self.cfg.max_deg:
            raise JointLimitError(f"{self.name}: {angle_deg:.2f}° außerhalb "
                                  f"[{self.cfg.min_deg}, {self.cfg.max_deg}]")

    def servo_angle(self, angle_deg: float) -> float:
        """Gelenkwinkel -> Servo-Horn-Winkel relativ zur Servo-Mitte."""
        sign = -1.0 if self.cfg.inverted else 1.0
        return sign * angle_deg + self.offset_deg

    def pulse_us(self, angle_deg: float) -> float:
        self.check_angle(angle_deg)
        c = self.cfg
        horn = self.servo_angle(angle_deg)
        # Durch die Prüfung in config.load_config ist |horn| <= travel/2 garantiert;
        # hier trotzdem hart absichern, falls ein Offset nachträglich gesetzt wurde.
        if abs(horn) > c.travel_deg / 2:
            raise JointLimitError(f"{self.name}: Servowinkel {horn:.2f}° außerhalb des Stellwegs")
        center = (c.pulse_min_us + c.pulse_max_us) / 2
        us_per_deg = (c.pulse_max_us - c.pulse_min_us) / c.travel_deg
        return center + horn * us_per_deg
