"""Copy a SQLite database safely (WAL-aware) and verify the copy.

Usage: python -I backup_sqlite.py <source.sqlite3> <destination.sqlite3>
Exit code 0 only when the copy exists and PRAGMA integrity_check returns "ok".
"""
import sqlite3
import sys


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: backup_sqlite.py <source> <destination>", file=sys.stderr)
        return 2
    source_path, destination_path = sys.argv[1], sys.argv[2]
    source = sqlite3.connect(f"file:{source_path}?mode=ro", uri=True)
    destination = sqlite3.connect(destination_path)
    try:
        source.backup(destination)
        result = destination.execute("PRAGMA integrity_check").fetchone()[0]
    finally:
        destination.close()
        source.close()
    print(result)
    return 0 if result == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
