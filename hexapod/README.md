# Hexapod-Späher — Steuersoftware

Raspberry Pi 5, 2× PCA9685 (0x40 / 0x41), 18 + 2 MG996R, Pi-Kamera.

## Stand

| Schritt | Inhalt | Status |
|---|---|---|
| 1 | Servo-Abstraktionsschicht + Kalibrierungstool | ✅ fertig |
| 2 | Kinematik eines Beins + Unit-Tests | offen — wartet auf Beingeometrie |
| 3 | Gait Engine (stehen, vorwärts) | offen |
| 4 | Web-/CLI-Steuerung | offen |
| 5 | Watchdog, Not-Halt | offen |
| 6 | Kamera + Platzhalter-Erkennung | offen |
| 7 | Greifer | offen |

## Aufbau

```
config/hexapod.yaml       Kanalbelegung, Grenzen, Spannungsgruppen, Soft-Start
config/calibration.yaml   Nullpunkt-Offsets (schreibt das Kalibrierungstool)
hardware/
  config.py               Laden + Prüfen der YAML (keine Hardware-Defaults im Code)
  pca9685.py              PCA9685-Treiber (smbus2) + Simulation
  servo.py                Gelenkwinkel -> Pulsbreite (Offset, Invertierung, Grenzen)
  controller.py           Rampen, Stromgruppen-Limit, Soft-Start, Entspannen
  leg.py                  Klasse Leg: Zielwinkel je Gelenk
  command_log.py          Zeitgestempeltes Protokoll aller Servobefehle
tools/calibrate.py        Interaktives Kalibrieren / Durchfahren eines Beins
tests/                    Unit-Tests (laufen ohne Hardware)
```

## Installation (Raspberry Pi)

```bash
sudo raspi-config nonint do_i2c 0     # I2C aktivieren, falls noch nicht geschehen
cd hexapod
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
i2cdetect -y 1                        # 0x40 und 0x41 müssen erscheinen
```

## Tests

```bash
cd hexapod && python3 -m pytest
```

## Kalibrieren

```bash
python3 tools/calibrate.py --sim      # Trockenlauf ohne Hardware
python3 tools/calibrate.py            # echte Servos
```

Roboter aufbocken, dann z. B.:

```
leg R1          # Bein wählen, Soft-Start in Mittelstellung
joint femur     # Gelenk wählen (coxa/femur/tibia)
trim +1         # Nullpunkt verschieben, bis das Gelenk mechanisch mittig steht
+  / -          # um Schrittweite fahren (step 0.5 ändert sie)
go -20          # auf Winkel fahren
sweep           # min -> max -> 0
legsweep        # alle drei Gelenke nacheinander
save            # Offsets nach config/calibration.yaml
quit            # beenden, alle Servos werden entspannt
```

## Verhalten und Grenzen, die man kennen muss

**Winkelkonvention.** Jedes Gelenk: 0° = Mittelstellung. `inverted` spiegelt
die Drehrichtung (linke Seite). Der Kalibrierungs-Offset wirkt auf den
Servo-Horn-Winkel, also *nach* der Invertierung.

**Keine stillen Grenzen.** Jede Hardwaregrenze (Pulsbereich, Stellweg,
Gelenkgrenzen, Geschwindigkeit, Offset) muss in `hexapod.yaml` stehen, sonst
startet die Software nicht. Ziele außerhalb der Grenzen werden mit
`JointLimitError` abgelehnt, nicht gekappt. Die ausgelieferten Werte (±30°,
500–2500 µs über 180°) sind vorsichtige Platzhalter, **nicht gemessen**.

**Soft-Start und seine Grenze.** Der MG996R meldet seine Position nicht
zurück. Der erste Puls nach dem Einschalten lässt ihn deshalb von der
unbekannten Ist-Stellung zum Sollwert springen — das kann keine Software
verhindern. Die Software entschärft es:
- Servos werden einzeln nacheinander aktiviert (`startup.activation_delay_s`).
- Liegt der Roboter in einer bekannten Parkhaltung, wird sie unter
  `startup.assumed_rest_pose` eingetragen; dann geht der erste Puls genau
  dorthin und danach langsam (`startup.speed_deg_s`) in die Mittelstellung.

**Stromgruppen-Limit.** Pro Spannungsgruppe fahren höchstens
`max_moving_servos` Servos gleichzeitig; weitere Aufträge warten in
Auftragsreihenfolge. Das begrenzt Anlaufspitzen, nicht den Haltestrom der
stehenden Servos. Aktuell ist angenommen: eine Gruppe pro PCA9685-Board —
bitte an die echte UBEC-Verdrahtung anpassen.

**Entspannen.** `relax()` schaltet das PWM-Signal ab; die Servos werden
kraftlos, das Bein sackt unter Last ab.

**Treiberstart.** Beim Initialisieren werden die PCA9685-Kanäle bewusst nicht
zurückgesetzt, und der Prescaler wird nur geschrieben, wenn er abweicht (der
dafür nötige Sleep-Modus schaltet alle Ausgänge kurz ab).

**Logging.** Jeder PWM-Schreibzugriff, jedes Ziel, Aktivieren, Entspannen und
jede Offset-Änderung landet in `logs/servo_commands.log` (rotierend) mit
UTC-Zeitstempel und monotoner Zeit:

```
2026-09-26T06:48:33.560898+00:00 mono=315.448397 ACTIVATE servo=R1.coxa out=pca_right:0 angle=0.00 pulse_us=1500.00
```
