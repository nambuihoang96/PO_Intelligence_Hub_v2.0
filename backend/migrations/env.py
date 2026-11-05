from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, event, pool

from backend.app.db import get_database_path, get_database_url
from backend.app.models import Base


config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _configure_sqlite(connection, _record) -> None:
    cursor = connection.cursor()
    # SQLite's batch table rebuild drops and recreates tables. DROP TABLE
    # performs an implicit DELETE, which can fail against rows in child tables
    # even though the same parent table is recreated moments later. Disable FK
    # enforcement only on this dedicated Alembic connection, then run a full
    # foreign_key_check before the migration transaction can commit. The app's
    # normal database engine continues to use foreign_keys=ON.
    cursor.execute("PRAGMA foreign_keys=OFF")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.close()


def run_migrations_offline() -> None:
    url = get_database_url().render_as_string(hide_password=False)
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True, dialect_opts={"paramstyle": "named"}, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    get_database_path().parent.mkdir(parents=True, exist_ok=True)
    url = get_database_url().render_as_string(hide_password=False).replace("%", "%%")
    section = config.get_section(config.config_ini_section, {})
    section["sqlalchemy.url"] = url
    connectable = engine_from_config(section, prefix="sqlalchemy.", poolclass=pool.NullPool)
    event.listen(connectable, "connect", _configure_sqlite)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True, transactional_ddl=True)
        before_violations = connection.exec_driver_sql("PRAGMA foreign_key_check").all()
        if before_violations:
            details = "; ".join(
                f"{table} row {row_id} references {parent} (foreign key {foreign_key_id})"
                for table, row_id, parent, foreign_key_id in before_violations[:10]
            )
            raise RuntimeError(f"Existing SQLite data has foreign-key violations; migration was not started: {details}")
        with context.begin_transaction():
            context.run_migrations()
            violations = connection.exec_driver_sql("PRAGMA foreign_key_check").all()
            if violations:
                details = "; ".join(
                    f"{table} row {row_id} references {parent} (foreign key {foreign_key_id})"
                    for table, row_id, parent, foreign_key_id in violations[:10]
                )
                raise RuntimeError(f"Database migration produced foreign-key violations: {details}")
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        if connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() != 1:
            raise RuntimeError("SQLite foreign-key enforcement could not be restored after migration.")
    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
