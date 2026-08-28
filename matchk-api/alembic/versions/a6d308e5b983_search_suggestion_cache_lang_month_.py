"""search_suggestion_cache lang+month unique

Revision ID: a6d308e5b983
Revises: 4607e2ffebcb
Create Date: 2026-08-24 14:49:42.155857
"""
from alembic import op
import sqlalchemy as sa


revision = 'a6d308e5b983'
down_revision = '4607e2ffebcb'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ⚠️ 손으로 고침 (2026-08-24, 정현님 피드백 후 16시이후 재수정): autogenerate/batch 모드 둘 다
    # SQLite의 예전 UNIQUE(lang) 익명 제약을 못 지웠음(reflection이 계속 옛 정의를
    # 들고 옴) — 그래서 테이블을 통째로 새로 만들어 데이터만 옮기는 방식으로 처리함.
    #
    # ⚠️ 배포 DB는 Postgres라 SQLite 전용 문법("DATETIME" 등 생 SQL 문자열)을 쓰면
    # 배포에서 깨짐 — 첫 버전은 op.execute()에 SQL을 직접 문자열로 박아서 이 문제가
    # 있었음. op.create_table()에 SQLAlchemy 타입(sa.DateTime() 등)을 쓰면 alembic이
    # SQLite/Postgres 각각에 맞는 실제 타입으로 알아서 번역해줘서 두 DB 모두 안전함.
    op.create_table(
        'search_suggestion_cache_new',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('lang', sa.String(length=8), nullable=False),
        sa.Column('month', sa.Integer(), nullable=False),
        sa.Column('items', sa.JSON(), nullable=False),
        sa.Column('generated_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('lang', 'month', name='uq_search_suggestion_cache_lang_month'),
    )
    # INSERT/DROP TABLE/RENAME TO는 SQLite·Postgres 둘 다 지원하는 표준 SQL이라 그대로 둠.
    op.execute("""
        INSERT INTO search_suggestion_cache_new (id, lang, month, items, generated_at)
        SELECT id, lang, month, items, generated_at FROM search_suggestion_cache
    """)
    op.drop_table('search_suggestion_cache')
    op.rename_table('search_suggestion_cache_new', 'search_suggestion_cache')


def downgrade() -> None:
    with op.batch_alter_table('search_suggestion_cache', recreate='always') as batch_op:
        batch_op.drop_constraint('uq_search_suggestion_cache_lang_month', type_='unique')
