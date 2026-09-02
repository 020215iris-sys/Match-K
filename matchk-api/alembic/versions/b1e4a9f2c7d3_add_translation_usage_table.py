"""add translation_usage table

Revision ID: b1e4a9f2c7d3
Revises: a6d308e5b983
Create Date: 2026-09-02 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'b1e4a9f2c7d3'
down_revision = 'a6d308e5b983'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'translation_usage',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('month', sa.String(length=7), nullable=False),
        sa.Column('char_count', sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('month'),
    )


def downgrade() -> None:
    op.drop_table('translation_usage')
