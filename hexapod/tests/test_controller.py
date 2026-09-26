import dataclasses

import pytest

from hardware import Leg, ServoNotActiveError
from hardware.servo import JointLimitError
from tests.conftest import make_controller

RIGHT_LEG_SERVOS = [f"{leg}.{j}" for leg in ("R1", "R2", "R3") for j in ("coxa", "femur", "tibia")]


def activate_all_at_zero(ctl, names):
    for n in names:
        ctl.activate(n, 0.0)


def test_relaxed_servo_refuses_ramp(ctl):
    ctl, _ = ctl
    with pytest.raises(ServoNotActiveError):
        ctl.set_target("R1.coxa", 10)


def test_ramp_respects_speed(ctl):
    ctl, drivers = ctl
    ctl.activate("R1.coxa", 0.0)
    ctl.set_target("R1.coxa", 20, speed=10)  # 10 °/s
    ctl.step(0.5)
    assert ctl.position("R1.coxa") == pytest.approx(5)
    ctl.step(0.5)
    assert ctl.position("R1.coxa") == pytest.approx(10)
    ctl.wait_until_idle()
    assert ctl.position("R1.coxa") == pytest.approx(20)
    assert drivers["pca_right"].pulses[0] == pytest.approx(ctl.servo("R1.coxa").pulse_us(20))


def test_no_single_pwm_update_jumps_more_than_speed_allows(ctl):
    ctl, _ = ctl
    ctl.activate("R2.femur", -30.0)
    ctl.set_target("R2.femur", 30.0, speed=20)
    dt = 1 / ctl.cfg.update_hz
    last = ctl.position("R2.femur")
    while ctl.is_moving():
        ctl.step(dt)
        assert abs(ctl.position("R2.femur") - last) <= 20 * dt + 1e-9
        last = ctl.position("R2.femur")


def test_speed_above_configured_max_rejected(ctl):
    ctl, _ = ctl
    ctl.activate("R1.coxa", 0.0)
    with pytest.raises(ValueError):
        ctl.set_target("R1.coxa", 10, speed=1000)


def test_target_outside_limits_rejected_and_nothing_moves(ctl):
    ctl, drivers = ctl
    ctl.activate("R1.coxa", 0.0)
    writes = len(drivers["pca_right"].writes)
    with pytest.raises(JointLimitError):
        ctl.set_target("R1.coxa", 45)
    ctl.step(0.1)
    assert len(drivers["pca_right"].writes) == writes


def test_power_group_limit_caps_simultaneous_movers(ctl):
    ctl, _ = ctl
    limit = ctl.cfg.power_groups["rail_right"]
    activate_all_at_zero(ctl, RIGHT_LEG_SERVOS)
    for n in RIGHT_LEG_SERVOS:
        ctl.set_target(n, 10)
    dt = 1 / ctl.cfg.update_hz
    max_seen = 0
    moved_at_once = set()
    first_step_positions = None
    while ctl.is_moving():
        before = {n: ctl.position(n) for n in RIGHT_LEG_SERVOS}
        ctl.step(dt)
        changed = {n for n in RIGHT_LEG_SERVOS if ctl.position(n) != before[n]}
        max_seen = max(max_seen, len(changed))
        if first_step_positions is None:
            first_step_positions = changed
        moved_at_once |= changed
    assert max_seen == limit
    # Auftragsreihenfolge: die zuerst beauftragten Servos fahren zuerst.
    assert first_step_positions == set(RIGHT_LEG_SERVOS[:limit])
    assert moved_at_once == set(RIGHT_LEG_SERVOS)
    assert all(ctl.position(n) == pytest.approx(10) for n in RIGHT_LEG_SERVOS)


def test_power_groups_are_independent(ctl):
    ctl, _ = ctl
    names = ["R1.coxa", "R1.femur", "R1.tibia", "R2.coxa", "L1.coxa", "L1.femur"]
    activate_all_at_zero(ctl, names)
    for n in names:
        ctl.set_target(n, 5)
    ctl.step(0.01)
    assert ctl.moving_count("rail_right") == 3
    assert ctl.moving_count("rail_left") == 2


def test_soft_start_activates_one_by_one_then_ramps_to_neutral(cfg):
    rest = {"coxa": 0.0, "femur": 25.0, "tibia": -25.0}
    cfg = dataclasses.replace(cfg, startup=dataclasses.replace(cfg.startup, assumed_rest_pose=rest))
    ctl, drivers = make_controller(cfg)
    sleeps = []
    ctl._sleep = sleeps.append
    leg = Leg("R1", ctl)
    leg.soft_start()
    writes = drivers["pca_right"].writes
    # erste drei Schreibzugriffe = Aktivierung in Parkhaltung, je einer pro Servo
    first = writes[:3]
    assert [ch for ch, _ in first] == [0, 1, 2]
    assert first[1][1] == pytest.approx(ctl.servo("R1.femur").pulse_us(25))
    assert sleeps == [cfg.startup.activation_delay_s] * 3
    # danach nur noch kleine Rampenschritte bis 0°
    max_step_deg = cfg.startup.speed_deg_s / cfg.update_hz
    us_per_deg = 2000 / 180
    last = {ch: p for ch, p in first}
    for ch, pulse in writes[3:]:
        assert abs(pulse - last[ch]) <= max_step_deg * us_per_deg + 1e-6
        last[ch] = pulse
    assert leg.angles() == {"coxa": 0.0, "femur": 0.0, "tibia": 0.0}


def test_soft_start_without_rest_pose_starts_at_neutral(ctl):
    ctl, drivers = ctl
    Leg("L2", ctl).soft_start()
    assert all(p == pytest.approx(1500) for _, p in drivers["pca_left"].writes)


def test_relax_switches_pwm_off_and_forgets_position(ctl):
    ctl, drivers = ctl
    leg = Leg("R3", ctl)
    leg.soft_start()
    leg.relax()
    assert all(drivers["pca_right"].pulses[ch] is None for ch in (6, 7, 8))
    assert leg.angles() == {"coxa": None, "femur": None, "tibia": None}
    with pytest.raises(ServoNotActiveError):
        leg.set_joint("coxa", 5)


def test_leg_set_angles_is_all_or_nothing(ctl):
    ctl, _ = ctl
    leg = Leg("R1", ctl)
    leg.soft_start()
    with pytest.raises(JointLimitError):
        leg.set_angles(10, 10, 99)
    assert leg.targets() == {"coxa": 0.0, "femur": 0.0, "tibia": 0.0}
    leg.set_angles(10, -5, 7)
    leg.wait()
    assert leg.angles() == pytest.approx({"coxa": 10, "femur": -5, "tibia": 7})


def test_offset_change_rewrites_active_servo(ctl):
    ctl, drivers = ctl
    ctl.activate("R1.coxa", 0.0)
    ctl.set_offset("R1.coxa", 2.0)
    assert drivers["pca_right"].pulses[0] == pytest.approx(1500 + 2 * 2000 / 180)


def test_background_thread_reaches_target(ctl):
    ctl, _ = ctl
    ctl.activate("R1.coxa", 0.0)
    ctl.start()
    try:
        ctl.set_target("R1.coxa", 3)
        assert ctl.wait_until_idle(timeout=2)
    finally:
        ctl.stop()
    assert ctl.position("R1.coxa") == pytest.approx(3)
