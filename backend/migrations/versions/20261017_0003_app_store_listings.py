"""Add a store-specific app listing registry."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261017_0003"
down_revision: Union[str, None] = "20261017_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "app_store_listings",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("platform", sa.String(length=16), nullable=False),
        sa.Column("store_app_id", sa.String(length=255), nullable=False),
        sa.Column("country", sa.String(length=2), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("developer", sa.String(length=200), nullable=False),
        sa.Column("listing_url", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("platform IN ('ios','android')", name="ck_app_store_listings_platform"),
        sa.CheckConstraint("length(country) = 2 AND country GLOB '[A-Z][A-Z]'", name="ck_app_store_listings_country"),
        sa.PrimaryKeyConstraint("id", name="pk_app_store_listings"),
        sa.UniqueConstraint("platform", "country", "store_app_id", name="uq_app_store_listings_platform_country_store_id"),
    )
    op.create_index(
        "ix_app_store_listings_country_platform_id",
        "app_store_listings",
        ["country", "platform", "id"],
    )


def downgrade() -> None:
    op.drop_index("ix_app_store_listings_country_platform_id", table_name="app_store_listings")
    op.drop_table("app_store_listings")
