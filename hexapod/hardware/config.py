"""Laden und Prüfen der Hardware-Konfiguration.

Grundsatz: Im Code gibt es keine Standardwerte für Hardwaregrenzen. Fehlt ein
Schlüssel in der YAML-Datei, bricht das Laden mit einer klaren Meldung ab,
statt stillschweigend einen Wert anzunehmen.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping

import yaml

LEG_NAMES = ("R1", "R2", "R3", "L1", "L2", "L3")
LEG_JOINTS = ("coxa", "femur", "tibia")
PCA9685_CHANNELS = 16


class ConfigError(ValueError):
    pass


@dataclass(frozen=True)
class ServoConfig:
    name: str  # z. B. "R1.coxa"
    board: str
    channel: int
    power_group: str
    min_deg: float
    max_deg: float
    inverted: bool
    pulse_min_us: float
    pulse_max_us: float
    travel_deg: float
    max_speed_deg_s: float
    max_offset_deg: float


@dataclass(frozen=True)
class BoardConfig:
    name: str
    address: int
    power_group: str


@dataclass(frozen=True)
class StartupConfig:
    activation_delay_s: float
    speed_deg_s: float
    assumed_rest_pose: dict[str, float] | None


@dataclass(frozen=True)
class LoggingConfig:
    servo_log_file: Path
    max_bytes: int
    backup_count: int


@dataclass(frozen=True)
class HexapodConfig:
    i2c_bus: int
    frequency_hz: float
    oscillator_hz: float
    update_hz: float
    boards: dict[str, BoardConfig]
    power_groups: dict[str, int]  # Gruppe -> max_moving_servos
    servos: dict[str, ServoConfig]
    startup: StartupConfig
    logging: LoggingConfig
    offsets_deg: dict[str, float] = field(default_factory=dict)

    def leg_servo_names(self, leg: str) -> list[str]:
        return [f"{leg}.{j}" for j in LEG_JOINTS]


def _req(mapping: Mapping[str, Any], key: str, where: str) -> Any:
    if not isinstance(mapping, Mapping) or key not in mapping:
        raise ConfigError(f"Pflichtschlüssel '{key}' fehlt in {where}")
    return mapping[key]


def _num(mapping: Mapping[str, Any], key: str, where: str, *, positive: bool = False) -> float:
    value = _req(mapping, key, where)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ConfigError(f"{where}.{key} muss eine Zahl sein, ist {value!r}")
    if positive and value <= 0:
        raise ConfigError(f"{where}.{key} muss > 0 sein, ist {value}")
    return float(value)


def _servo(name: str, group_cfg: Mapping, joint_cfg: Mapping, defaults: Mapping,
           boards: dict[str, BoardConfig]) -> ServoConfig:
    where = f"servo {name}"
    board = _req(group_cfg, "board", where)
    if board not in boards:
        raise ConfigError(f"{where}: unbekanntes Board '{board}'")
    merged = {**defaults, **joint_cfg}
    channel = _req(merged, "channel", where)
    if not isinstance(channel, int) or not 0 <= channel < PCA9685_CHANNELS:
        raise ConfigError(f"{where}: Kanal {channel!r} ungültig (0..15)")
    inverted = _req(merged, "inverted", where)
    if not isinstance(inverted, bool):
        raise ConfigError(f"{where}.inverted muss true/false sein")
    cfg = ServoConfig(
        name=name,
        board=board,
        channel=channel,
        power_group=boards[board].power_group,
        min_deg=_num(merged, "min_deg", where),
        max_deg=_num(merged, "max_deg", where),
        inverted=inverted,
        pulse_min_us=_num(merged, "pulse_min_us", where, positive=True),
        pulse_max_us=_num(merged, "pulse_max_us", where, positive=True),
        travel_deg=_num(merged, "travel_deg", where, positive=True),
        max_speed_deg_s=_num(merged, "max_speed_deg_s", where, positive=True),
        max_offset_deg=_num(merged, "max_offset_deg", where),
    )
    if not cfg.min_deg < 0 < cfg.max_deg:
        raise ConfigError(f"{where}: Grenzen müssen die Mittelstellung 0 einschließen "
                          f"(min_deg < 0 < max_deg), sind {cfg.min_deg}..{cfg.max_deg}")
    if cfg.pulse_min_us >= cfg.pulse_max_us:
        raise ConfigError(f"{where}: pulse_min_us muss kleiner als pulse_max_us sein")
    half = cfg.travel_deg / 2
    reach = max(abs(cfg.min_deg), abs(cfg.max_deg)) + cfg.max_offset_deg
    if reach > half:
        raise ConfigError(
            f"{where}: Gelenkgrenze + max_offset_deg ({reach}°) überschreitet den "
            f"Servo-Stellweg ±{half}°")
    return cfg


def load_config(path: str | Path, calibration_path: str | Path | None = None) -> HexapodConfig:
    path = Path(path)
    raw = yaml.safe_load(path.read_text())
    base_dir = path.parent

    pwm = _req(raw, "pwm", "Konfiguration")
    groups_raw = _req(raw, "power_groups", "Konfiguration")
    power_groups: dict[str, int] = {}
    for gname, g in groups_raw.items():
        limit = _req(g, "max_moving_servos", f"power_groups.{gname}")
        if not isinstance(limit, int) or limit < 1:
            raise ConfigError(f"power_groups.{gname}.max_moving_servos muss eine ganze Zahl >= 1 sein")
        power_groups[gname] = limit

    boards: dict[str, BoardConfig] = {}
    addresses: set[int] = set()
    for bname, b in _req(raw, "boards", "Konfiguration").items():
        address = _req(b, "address", f"boards.{bname}")
        group = _req(b, "power_group", f"boards.{bname}")
        if group not in power_groups:
            raise ConfigError(f"boards.{bname}: unbekannte Spannungsgruppe '{group}'")
        if address in addresses:
            raise ConfigError(f"boards.{bname}: I2C-Adresse 0x{address:02x} doppelt vergeben")
        addresses.add(address)
        boards[bname] = BoardConfig(bname, int(address), group)

    defaults = _req(raw, "servo_defaults", "Konfiguration")
    servos: dict[str, ServoConfig] = {}
    legs = _req(raw, "legs", "Konfiguration")
    for leg in LEG_NAMES:
        leg_cfg = _req(legs, leg, "legs")
        joints = _req(leg_cfg, "joints", f"legs.{leg}")
        for joint in LEG_JOINTS:
            name = f"{leg}.{joint}"
            servos[name] = _servo(name, leg_cfg, _req(joints, joint, f"legs.{leg}.joints"),
                                  defaults, boards)
    gripper = raw.get("gripper")
    if gripper:
        for joint, jcfg in _req(gripper, "joints", "gripper").items():
            name = f"gripper.{joint}"
            servos[name] = _servo(name, gripper, jcfg, defaults, boards)

    used: dict[tuple[str, int], str] = {}
    for s in servos.values():
        key = (s.board, s.channel)
        if key in used:
            raise ConfigError(f"Kanal {s.board}:{s.channel} doppelt belegt ({used[key]}, {s.name})")
        used[key] = s.name

    st = _req(raw, "startup", "Konfiguration")
    rest = _req(st, "assumed_rest_pose", "startup")
    if rest is not None:
        rest = {j: _num(rest, j, "startup.assumed_rest_pose") for j in LEG_JOINTS}
    startup = StartupConfig(
        activation_delay_s=_num(st, "activation_delay_s", "startup"),
        speed_deg_s=_num(st, "speed_deg_s", "startup", positive=True),
        assumed_rest_pose=rest,
    )

    lg = _req(raw, "logging", "Konfiguration")
    log_file = Path(_req(lg, "servo_log_file", "logging"))
    if not log_file.is_absolute():
        log_file = base_dir.parent / log_file
    logging_cfg = LoggingConfig(log_file, int(_num(lg, "max_bytes", "logging", positive=True)),
                                int(_num(lg, "backup_count", "logging")))

    offsets: dict[str, float] = {}
    if calibration_path is not None and Path(calibration_path).exists():
        cal = yaml.safe_load(Path(calibration_path).read_text()) or {}
        for name, value in (cal.get("offsets_deg") or {}).items():
            if name not in servos:
                raise ConfigError(f"calibration: unbekannter Servo '{name}'")
            value = float(value)
            if abs(value) > servos[name].max_offset_deg:
                raise ConfigError(f"calibration: Offset {name}={value}° überschreitet "
                                  f"max_offset_deg={servos[name].max_offset_deg}°")
            offsets[name] = value

    return HexapodConfig(
        i2c_bus=int(_req(pwm, "i2c_bus", "pwm")),
        frequency_hz=_num(pwm, "frequency_hz", "pwm", positive=True),
        oscillator_hz=_num(pwm, "oscillator_hz", "pwm", positive=True),
        update_hz=_num(raw, "update_hz", "Konfiguration", positive=True),
        boards=boards,
        power_groups=power_groups,
        servos=servos,
        startup=startup,
        logging=logging_cfg,
        offsets_deg=offsets,
    )


def save_calibration(path: str | Path, offsets_deg: Mapping[str, float]) -> None:
    header = ("# Nullpunkt-Offsets pro Servo in Grad (Servo-Name = <Bein>.<Gelenk>).\n"
              "# Wird von tools/calibrate.py geschrieben. Fehlende Einträge = 0.\n")
    data = {"offsets_deg": {k: round(float(v), 2) for k, v in sorted(offsets_deg.items()) if v != 0}}
    Path(path).write_text(header + yaml.safe_dump(data, sort_keys=True))
