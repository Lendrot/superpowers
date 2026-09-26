from pathlib import Path

import pytest

from hardware import ServoCommandLog, ServoController, SimulatedPCA9685, load_config

CONFIG = Path(__file__).resolve().parent.parent / "config" / "hexapod.yaml"


@pytest.fixture
def cfg():
    return load_config(CONFIG)


def make_controller(cfg):
    drivers = {name: SimulatedPCA9685(b.address) for name, b in cfg.boards.items()}
    ctl = ServoController(cfg, drivers, ServoCommandLog(None), sleep=lambda s: None)
    return ctl, drivers


@pytest.fixture
def ctl(cfg):
    return make_controller(cfg)
