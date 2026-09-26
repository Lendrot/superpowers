import re

from hardware import ServoCommandLog


def test_log_lines_have_timestamps_and_fields(tmp_path):
    path = tmp_path / "servo.log"
    log = ServoCommandLog(path)
    log.event("PWM", servo="R1.coxa", out="pca_right:0", angle=1.0, pulse_us=1511.1)
    log.close()
    line = path.read_text().strip()
    assert re.match(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}\+00:00 mono=\d+\.\d{6} PWM ", line)
    assert "servo=R1.coxa" in line and "pulse_us=1511.10" in line
