"""Ein Bein = drei Servos (Hüfte/coxa, Oberschenkel/femur, Unterschenkel/tibia)."""

from __future__ import annotations

from .config import LEG_JOINTS, LEG_NAMES
from .controller import ServoController


class Leg:
    JOINTS = LEG_JOINTS

    def __init__(self, name: str, controller: ServoController):
        if name not in LEG_NAMES:
            raise ValueError(f"Unbekanntes Bein '{name}', erlaubt: {LEG_NAMES}")
        self.name = name
        self._ctl = controller

    def servo_name(self, joint: str) -> str:
        if joint not in self.JOINTS:
            raise ValueError(f"Unbekanntes Gelenk '{joint}', erlaubt: {self.JOINTS}")
        return f"{self.name}.{joint}"

    @property
    def servo_names(self) -> list[str]:
        return [self.servo_name(j) for j in self.JOINTS]

    def set_joint(self, joint: str, angle_deg: float, speed: float | None = None) -> None:
        self._ctl.set_target(self.servo_name(joint), angle_deg, speed)

    def set_angles(self, coxa: float, femur: float, tibia: float,
                   speed: float | None = None) -> None:
        """Alle drei Zielwinkel setzen. Grenzen werden VOR dem ersten Befehl
        geprüft, damit das Bein nie nur teilweise umgestellt wird."""
        angles = {"coxa": coxa, "femur": femur, "tibia": tibia}
        for joint, angle in angles.items():
            self._ctl.servo(self.servo_name(joint)).check_angle(angle)
        for joint, angle in angles.items():
            self.set_joint(joint, angle, speed)

    def angles(self) -> dict[str, float | None]:
        """Zuletzt kommandierte Winkel (keine Messung — MG996R hat keine Rückmeldung)."""
        return {j: self._ctl.position(self.servo_name(j)) for j in self.JOINTS}

    def targets(self) -> dict[str, float | None]:
        return {j: self._ctl.target(self.servo_name(j)) for j in self.JOINTS}

    def is_moving(self) -> bool:
        return self._ctl.is_moving(self.servo_names)

    def wait(self, timeout: float | None = None) -> bool:
        return self._ctl.wait_until_idle(timeout, names=self.servo_names)

    def soft_start(self) -> None:
        self._ctl.soft_start(self.servo_names)

    def relax(self) -> None:
        self._ctl.relax(self.servo_names)
