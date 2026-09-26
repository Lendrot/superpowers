"""Protokoll aller Servobefehle mit Zeitstempel.

Jede Zeile enthält Wanduhrzeit (UTC, µs) und eine monotone Zeit. Die monotone
Zeit ist für die Analyse von Zuckungen entscheidend, weil sie nicht springt,
wenn der Pi seine Uhr per NTP nachstellt.

Format (eine Zeile pro Ereignis, key=value, leicht mit grep/awk auswertbar):
  2026-09-26T10:00:00.123456+00:00 mono=12.345678 PWM servo=R1.coxa out=pca_right:0 angle=10.00 pulse_us=1611.1
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path


class ServoCommandLog:
    def __init__(self, path: Path | None, max_bytes: int = 5_000_000, backup_count: int = 5):
        self._logger = logging.getLogger(f"hexapod.servo_commands.{id(self)}")
        self._logger.setLevel(logging.INFO)
        self._logger.propagate = False
        if path is not None:
            path.parent.mkdir(parents=True, exist_ok=True)
            handler = RotatingFileHandler(path, maxBytes=max_bytes, backupCount=backup_count)
            handler.setFormatter(logging.Formatter("%(message)s"))
            self._logger.addHandler(handler)
        else:
            self._logger.addHandler(logging.NullHandler())

    def event(self, kind: str, **fields: object) -> None:
        now = datetime.now(timezone.utc).isoformat(timespec="microseconds")
        parts = [now, f"mono={time.monotonic():.6f}", kind]
        for key, value in fields.items():
            if isinstance(value, float):
                value = f"{value:.2f}"
            parts.append(f"{key}={value}")
        self._logger.info(" ".join(parts))

    def close(self) -> None:
        for handler in list(self._logger.handlers):
            handler.close()
            self._logger.removeHandler(handler)
