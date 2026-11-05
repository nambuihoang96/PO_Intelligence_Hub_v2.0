"""Generate the invented DEMO pair of Sensor Tower style CSV files.

Every game, publisher and number here is made up. Run: python docs/demo-data/generate_demo.py
"""
import csv
from pathlib import Path

# One row per game per metric, because the comparison only calculates changes when the unit,
# GEO, period and methodology all come from CSV columns. A real Sensor Tower export has none of these.
HEADER = [
    "Unified Name", "Unified ID", "Publisher Name", "Release Date", "Period Start", "Period End", "GEO", "Platform",
    "Methodology", "Source URL", "Metric ID", "Metric Definition", "Unit", "Value",
]
METRICS = [("downloads_absolute", "Downloads (Absolute)", "downloads"), ("revenue_absolute", "Revenue (Absolute)", "USD"), ("dau_absolute", "DAU (Absolute)", "users")]

# name, publisher, release date, baseline downloads, current downloads, baseline revenue, current revenue, baseline DAU, current DAU
# None means the game is absent from that period, or that the value is missing.
GAMES = [
    # Sharp risers
    ("DEMO Sort Rocket", "A", "10/02/2026", 3_200_000, 9_800_000, 410_000, 1_350_000, 900_000, 2_700_000),
    ("DEMO Tile Comet", "B", "22/03/2026", 2_100_000, 5_900_000, 120_000, 380_000, 500_000, 1_500_000),
    ("DEMO Merge Spark", "C", "05/04/2026", 4_000_000, 7_600_000, 2_200_000, 4_300_000, 1_100_000, 2_000_000),
    # Sharp fallers
    ("DEMO Block Fade", "A", "14/01/2026", 11_500_000, 5_200_000, 650_000, 310_000, 4_800_000, 2_900_000),
    ("DEMO Screw Slide", "D", "03/12/2025", 8_900_000, 4_300_000, 95_000, 52_000, 3_100_000, 1_900_000),
    ("DEMO Jam Drift", "E", "18/02/2026", 7_400_000, 3_800_000, 1_200_000, 700_000, 2_600_000, 1_500_000),
    # Stable leaders, with prior-year history
    ("DEMO Royal Steady", "F", "12/06/2021", 12_400_000, 12_100_000, 88_000_000, 90_500_000, 15_200_000, 15_400_000),
    ("DEMO Harbor Story", "G", "20/09/2022", 10_900_000, 11_300_000, 96_000_000, 104_000_000, 9_000_000, 9_300_000),
    ("DEMO Color Classic", "H", "17/04/2019", 9_700_000, 9_900_000, 150_000, 160_000, 4_400_000, 4_500_000),
    ("DEMO Word Calm", "I", "02/11/2020", 6_300_000, 6_200_000, 3_100_000, 3_050_000, 2_800_000, 2_750_000),
    ("DEMO Solitaire Quiet", "J", "25/07/2018", 5_100_000, 5_250_000, 7_400_000, 7_600_000, 3_900_000, 3_950_000),
    ("DEMO Sudoku Plain", "K", "09/03/2017", 4_700_000, 4_600_000, 520_000, 510_000, 2_200_000, 2_180_000),
    # Rank swaps in the middle of the list
    ("DEMO Bus Switch", "B", "13/03/2026", 3_600_000, 4_450_000, 2_700_000, 3_300_000, 1_300_000, 1_600_000),
    ("DEMO Arrow Swap", "C", "08/02/2026", 4_400_000, 3_700_000, 0, 0, 2_500_000, 2_100_000),
    ("DEMO Hidden Turn", "L", "30/01/2026", 2_900_000, 3_500_000, 240_000, 300_000, 700_000, 860_000),
    ("DEMO Pixel Shift", "M", "14/05/2026", 3_400_000, 2_950_000, 2_900_000, 2_500_000, 1_000_000, 880_000),
    # Downloads steady while revenue moves
    ("DEMO Coin Monetize", "D", "21/08/2025", 2_600_000, 2_650_000, 900_000, 2_400_000, 800_000, 820_000),
    ("DEMO Gem Payless", "E", "16/10/2024", 2_450_000, 2_500_000, 3_300_000, 1_400_000, 950_000, 940_000),
    # Incomplete values, so the app must show gaps rather than fill them
    ("DEMO Missing Revenue", "N", "11/06/2026", 2_300_000, 2_380_000, None, 510_000, 600_000, 630_000),
    ("DEMO Missing DAU", "O", "02/04/2026", 2_200_000, 2_050_000, 330_000, 300_000, 540_000, None),
    # Small and stable, to fill out the list
    ("DEMO Find Small", "P", "19/12/2025", 1_950_000, 2_000_000, 80_000, 85_000, 410_000, 420_000),
    ("DEMO Drop Small", "Q", "09/05/2026", 1_850_000, 1_800_000, 60_000, 58_000, 380_000, 370_000),
    ("DEMO Blast Small", "R", "25/04/2026", 1_700_000, 1_750_000, 45_000, 47_000, 360_000, 365_000),
    # Only in the baseline period
    ("DEMO Leaves List One", "S", "23/04/2025", 1_600_000, None, 70_000, None, 340_000, None),
    ("DEMO Leaves List Two", "T", "18/06/2025", 1_500_000, None, 30_000, None, 300_000, None),
    # Only in the current period, released between the two
    ("DEMO New Entrant Fast", "A", "20/08/2026", None, 6_700_000, None, 900_000, None, 2_100_000),
    ("DEMO New Entrant Mid", "U", "01/09/2026", None, 3_100_000, None, 150_000, None, 750_000),
]


def build(start, end, downloads, revenue, dau):
    rows = []
    for index, game in enumerate(GAMES, 1):
        if game[downloads] is None:
            continue
        for (metric_id, definition, unit), column in zip(METRICS, (downloads, revenue, dau)):
            value = "" if game[column] is None else str(game[column])
            rows.append([
                game[0], f"demo-game-{index:04d}", f"DEMO Studio {game[1]}", game[2], start, end, "Worldwide", "Unified",
                "DEMO: số tự tạo, không phải dữ liệu Sensor Tower", "https://example.com/demo-data",
                metric_id, definition, unit, value,
            ])
    return rows


FILES = {
    # Both windows are 30 days, because the comparison rejects windows of unequal length.
    "DEMO Unified Top Apps Downloads YoY Growth (Aug 15, 2026 - Sep 13, 2026, Worldwide).csv":
        build("2026-08-15", "2026-09-13", 3, 5, 7),
    "DEMO Unified Top Apps Downloads YoY Growth (Sep 14, 2026 - Oct 13, 2026, Worldwide).csv":
        build("2026-09-14", "2026-10-13", 4, 6, 8),
}

folder = Path(__file__).parent
for old_file in folder.glob("DEMO*.csv"):
    old_file.unlink()
for filename, rows in FILES.items():
    with (folder / filename).open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle, delimiter=";")
        writer.writerow(HEADER)
        writer.writerows(rows)
    print(filename, len(rows))
