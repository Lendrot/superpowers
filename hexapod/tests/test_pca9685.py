from hardware.pca9685 import prescale_for


def test_prescale_for_50hz_nominal_oscillator():
    # Datenblatt-Formel: round(25 MHz / (4096 * 50 Hz)) - 1 = 121
    assert prescale_for(50, 25_000_000) == 121
