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
    # ⚠️ 손으로 고침 (2026-08-24): autogenerate/batch 모드 둘 다 SQLite의 예전
    # UNIQUE(lang) 익명 제약을 못 지웠음(reflection이 계속 옛 정의를 들고 옴) — 그래서
    # 테이블을 통째로 새로 만들어 데이터만 옮기는 방식으로 확실하게 처리함.
    op.execute("""
        CREATE TABLE search_suggestion_cache_new (
            id INTEGER NOT NULL PRIMARY KEY,
            lang VARCHAR(8) NOT NULL,
            month INTEGER NOT NULL,
            items JSON NOT NULL,
            generated_at DATETIME NOT NULL,
            CONSTRAINT uq_search_suggestion_cache_lang_month UNIQUE (lang, month)
        )
    """)
    op.execute("""
        INSERT INTO search_suggestion_cache_new (id, lang, month, items, generated_at)
        SELECT id, lang, month, items, generated_at FROM search_suggestion_cache
    """)
    op.execute("DROP TABLE search_suggestion_cache")
    op.execute("ALTER TABLE search_suggestion_cache_new RENAME TO search_suggestion_cache")


def downgrade() -> None:
    with op.batch_alter_table('search_suggestion_cache', recreate='always') as batch_op:
        batch_op.drop_constraint('uq_search_suggestion_cache_lang_month', type_='unique')
