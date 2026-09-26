"""Hardware-Schicht: PCA9685-Treiber, Servo-Abstraktion, Beine."""

from __future__ import annotations

from pathlib import Path

from .command_log import ServoCommandLog
from .config import ConfigError, HexapodConfig, load_config
from .controller import ServoController, ServoNotActiveError
from .leg import Leg
from .pca9685 import PCA9685, SimulatedPCA9685
from .servo import JointLimitError, Servo

__all__ = [
    "ConfigError", "HexapodConfig", "JointLimitError", "Leg", "PCA9685", "Servo",
    "ServoCommandLog", "ServoController", "ServoNotActiveError", "SimulatedPCA9685",
    "build_controller", "load_config",
]


def build_controller(cfg: HexapodConfig, *, simulate: bool) -> ServoController:
    """Controller mit echten oder simulierten PCA9685-Boards aufbauen."""
    if simulate:
        drivers = {name: SimulatedPCA9685(b.address) for name, b in cfg.boards.items()}
    else:
        drivers = {name: PCA9685(b.address, bus=cfg.i2c_bus, frequency_hz=cfg.frequency_hz,
                                 oscillator_hz=cfg.oscillator_hz)
                   for name, b in cfg.boards.items()}
    log = ServoCommandLog(Path(cfg.logging.servo_log_file), cfg.logging.max_bytes,
                          cfg.logging.backup_count)
    return ServoController(cfg, drivers, log)
