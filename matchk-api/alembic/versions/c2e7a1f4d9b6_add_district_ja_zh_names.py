"""add district name_ja/name_zh columns

Revision ID: c2e7a1f4d9b6
Revises: b1e4a9f2c7d3
Create Date: 2026-09-04 00:00:00.000000

업적지도 세부보기 리스트가 lang 무관하게 District.name_en만 내려주던 문제 수정(지현 QA,
2026-09-04). name_ja/name_zh를 TourAPI 공식 다국어(areaCode2) 값으로 채운다.

Postgres에서 기존 행이 있는 상태로 NOT NULL 컬럼을 바로 추가하면 실패하므로,
nullable로 추가 → sigungu_code 기준 데이터 채우기 → NOT NULL로 전환 순서로 진행.
"""
from alembic import op
import sqlalchemy as sa


revision = 'c2e7a1f4d9b6'
down_revision = 'b1e4a9f2c7d3'
branch_labels = None
depends_on = None

# seed_landmarks.py의 BUSAN_DISTRICTS와 동일 값 (TourAPI 공식 다국어 areaCode2 기준)
_NAMES_BY_CODE = {
    1: ("江西区", "江西区"),
    2: ("金井区", "金井区"),
    3: ("機張郡", "机张郡"),
    4: ("南区", "南区"),
    5: ("東区", "东区"),
    6: ("東莱区", "东莱区"),
    7: ("釜山鎮区", "釜山镇区"),
    8: ("北区", "北区"),
    9: ("沙上区", "沙上区"),
    10: ("沙下区", "沙下区"),
    11: ("西区", "西区"),
    12: ("水営区", "水营区"),
    13: ("蓮堤区", "莲堤区"),
    14: ("影島区", "影岛区"),
    15: ("中区", "中区"),
    16: ("海雲台区", "海云台区"),
}


def upgrade() -> None:
    # batch_alter_table: SQLite는 ALTER COLUMN ... SET NOT NULL을 지원 안 해서
    # (Postgres 전용 문법) 직접 op.alter_column을 쓰면 SQLite에서 syntax error남.
    # batch 모드는 SQLite에서 테이블을 재생성하는 방식으로 우회하고, Postgres에선
    # 그냥 직접 ALTER COLUMN으로 처리됨 — 두 DB 다 안전.
    with op.batch_alter_table('districts') as batch_op:
        batch_op.add_column(sa.Column('name_ja', sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column('name_zh', sa.String(length=64), nullable=True))

    districts = sa.table(
        'districts',
        sa.column('sigungu_code', sa.Integer),
        sa.column('name_ja', sa.String),
        sa.column('name_zh', sa.String),
    )
    conn = op.get_bind()
    for code, (name_ja, name_zh) in _NAMES_BY_CODE.items():
        conn.execute(
            districts.update()
            .where(districts.c.sigungu_code == code)
            .values(name_ja=name_ja, name_zh=name_zh)
        )

    with op.batch_alter_table('districts') as batch_op:
        batch_op.alter_column('name_ja', nullable=False)
        batch_op.alter_column('name_zh', nullable=False)


def downgrade() -> None:
    with op.batch_alter_table('districts') as batch_op:
        batch_op.drop_column('name_zh')
        batch_op.drop_column('name_ja')
