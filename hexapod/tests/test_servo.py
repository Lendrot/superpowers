import pytest

from hardware.servo import JointLimitError, Servo


def test_neutral_is_pulse_center(cfg):
    assert Servo(cfg.servos["R1.coxa"]).pulse_us(0) == pytest.approx(1500)


def test_linear_mapping(cfg):
    s = Servo(cfg.servos["R1.coxa"])  # 500..2500 µs über 180° => 11.11 µs/°
    assert s.pulse_us(30) == pytest.approx(1500 + 30 * 2000 / 180)
    assert s.pulse_us(-30) == pytest.approx(1500 - 30 * 2000 / 180)


def test_inverted_servo_mirrors(cfg):
    right = Servo(cfg.servos["R1.femur"])
    left = Servo(cfg.servos["L1.femur"])
    assert left.pulse_us(20) == pytest.approx(right.pulse_us(-20))


def test_offset_shifts_zero(cfg):
    s = Servo(cfg.servos["R1.coxa"], offset_deg=4.5)
    assert s.pulse_us(0) == pytest.approx(1500 + 4.5 * 2000 / 180)


def test_offset_applies_after_inversion(cfg):
    # Offset ist ein Servo-Horn-Wert: bei invertierten Servos NICHT mitgespiegelt.
    s = Servo(cfg.servos["L1.coxa"], offset_deg=4.5)
    assert s.pulse_us(0) == pytest.approx(1500 + 4.5 * 2000 / 180)


def test_out_of_range_raises_instead_of_clamping(cfg):
    s = Servo(cfg.servos["R1.coxa"])
    with pytest.raises(JointLimitError):
        s.pulse_us(30.01)
    with pytest.raises(JointLimitError):
        s.pulse_us(-45)


def test_offset_limit(cfg):
    with pytest.raises(JointLimitError):
        Servo(cfg.servos["R1.coxa"], offset_deg=21)
