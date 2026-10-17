from pathlib import Path

from sqlalchemy import URL, create_engine, event
from sqlalchemy.engine import Engine

from backend.app.config import get_data_root


DATABASE_FILENAME = "po_intelligence_hub.sqlite3"


def get_database_path() -> Path:
    """Return the SQLite file path under the configured local data root."""
    return get_data_root() / DATABASE_FILENAME


def get_database_url(database_path: Path | None = None) -> URL:
    path = database_path or get_database_path()
    return URL.create("sqlite", database=str(path.resolve()))


def create_database_engine(database_path: Path | None = None) -> Engine:
    path = database_path or get_database_path()
    path = path.resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        get_database_url(path),
        connect_args={"check_same_thread": False},
        pool_pre_ping=True,
    )

    @event.listens_for(engine, "connect")
    def configure_sqlite(dbapi_connection, _connection_record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()

    return engine
