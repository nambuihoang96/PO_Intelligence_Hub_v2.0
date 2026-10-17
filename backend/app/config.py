import os
from pathlib import Path


WORKSPACE_ROOT = Path(__file__).resolve().parents[2]


def _read_local_data_root() -> str | None:
    """Read only APP_DATA_ROOT from the project .env without changing process env."""
    env_file = WORKSPACE_ROOT / ".env"
    if not env_file.is_file():
        return None
    for line in env_file.read_text(encoding="utf-8").splitlines():
        key, separator, value = line.partition("=")
        if separator and key.strip() == "APP_DATA_ROOT":
            return value.strip().strip("\"'") or None
    return None


def get_data_root() -> Path:
    """Return the configured local data directory, defaulting inside the workspace."""
    configured_root = os.environ.get("APP_DATA_ROOT") or _read_local_data_root()
    if configured_root:
        return Path(configured_root).expanduser().resolve()
    return (WORKSPACE_ROOT / "data").resolve()
