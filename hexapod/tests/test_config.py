import copy

import pytest
import yaml

from hardware.config import ConfigError, load_config, save_calibration
from tests.conftest import CONFIG


def write(tmp_path, raw):
    path = tmp_path / "config" / "hexapod.yaml"
    path.parent.mkdir(exist_ok=True)
    path.write_text(yaml.safe_dump(raw))
    return path


@pytest.fixture
def raw():
    return yaml.safe_load(CONFIG.read_text())


def test_default_config_maps_all_twenty_servos(cfg):
    assert len(cfg.servos) == 20
    assert cfg.servos["R1.coxa"].board == "pca_right" and cfg.servos["R1.coxa"].channel == 0
    assert cfg.servos["R3.tibia"].channel == 8
    assert cfg.servos["L2.femur"].board == "pca_left" and cfg.servos["L2.femur"].channel == 4
    assert {cfg.servos["gripper.servo_a"].channel, cfg.servos["gripper.servo_b"].channel} == {9, 10}
    assert cfg.boards["pca_right"].address == 0x40
    assert cfg.boards["pca_left"].address == 0x41


def test_missing_limit_is_an_error_not_a_default(tmp_path, raw):
    del raw["legs"]["R2"]["joints"]["femur"]["max_deg"]
    with pytest.raises(ConfigError, match="max_deg"):
        load_config(write(tmp_path, raw))


def test_missing_pulse_range_is_an_error(tmp_path, raw):
    del raw["servo_defaults"]["pulse_min_us"]
    with pytest.raises(ConfigError, match="pulse_min_us"):
        load_config(write(tmp_path, raw))


def test_duplicate_channel_rejected(tmp_path, raw):
    raw["legs"]["R2"]["joints"]["coxa"]["channel"] = 0
    with pytest.raises(ConfigError, match="doppelt"):
        load_config(write(tmp_path, raw))


def test_limits_beyond_servo_travel_rejected(tmp_path, raw):
    raw["legs"]["R1"]["joints"]["tibia"]["max_deg"] = 85  # + 20 Offset > 90
    with pytest.raises(ConfigError, match="Stellweg"):
        load_config(write(tmp_path, raw))


def test_power_group_limit_must_be_positive(tmp_path, raw):
    raw["power_groups"]["rail_left"]["max_moving_servos"] = 0
    with pytest.raises(ConfigError):
        load_config(write(tmp_path, raw))


def test_calibration_roundtrip(tmp_path):
    cal = tmp_path / "calibration.yaml"
    save_calibration(cal, {"R1.coxa": 3.25, "L3.tibia": -1.5, "R2.femur": 0.0})
    cfg = load_config(CONFIG, cal)
    assert cfg.offsets_deg == {"R1.coxa": 3.25, "L3.tibia": -1.5}


def test_calibration_offset_beyond_max_rejected(tmp_path):
    cal = tmp_path / "calibration.yaml"
    cal.write_text("offsets_deg:\n  R1.coxa: 25\n")
    with pytest.raises(ConfigError, match="max_offset_deg"):
        load_config(CONFIG, cal)
