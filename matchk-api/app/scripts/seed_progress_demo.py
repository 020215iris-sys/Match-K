"""업적지도 진행률 색칠(fillOpacity) 그라데이션 육안 검증용 테스트 계정 생성.

무엇을 하는가:
  해운대구(sigungu_code=16, 일반 관광지 가장 많음=16개라 10%씩 촘촘하게 끊김)를
  기준으로, 0% / 10% / 20% ... 100% 진행률에 해당하는 도장 개수만큼 미리 찍어둔
  게스트 계정 11개를 만들고, 각 계정의 로그인 토큰을 출력한다.

사용법:
  python -m app.scripts.seed_progress_demo

  출력된 토큰을 Swagger(/docs) Authorize에 넣고 GET /api/stamps/progress 호출하면
  각 단계의 실제 progress 값을 확인할 수 있다. 실제 앱 화면(지도)에서 보려면,
  그 토큰을 폰의 SecureStore(auth_token 키)에 수동으로 넣어야 하는데 UI로는
  계정 전환 기능이 따로 없어 지금은 API 레벨 검증 전용이다.
  (앱에서 직접 보려면 AchievementMapScreen에 임시 progress override prop을
  넣어 스토리보드처럼 보는 방법도 있음 — 필요하면 별도로 만들 수 있음.)

⚠️ 데모/개발 전용 스크립트. 실행할 때마다 새 게스트 계정 11개가 새로 생긴다
   (기존 계정에 영향 없음). 프로덕션 DB에서 실행하지 말 것.
"""
from app.core.database import SessionLocal
from app.core.security import create_jwt
from app.models import District, Landmark, Stamp
from app.models.user import User

TARGET_SIGUNGU = 16  # 해운대구 — 일반 관광지 16개(가장 많아 10%씩 촘촘함)
STEPS = list(range(0, 101, 10))  # 0,10,20,...,100


def main() -> None:
    db = SessionLocal()
    try:
        district = db.query(District).filter_by(sigungu_code=TARGET_SIGUNGU).first()
        if district is None:
            print(f"district sigungu_code={TARGET_SIGUNGU} 없음 — seed_landmarks 먼저 실행하세요.")
            return

        landmarks = (db.query(Landmark)
                     .filter(Landmark.district_id == district.id, Landmark.is_active,
                             Landmark.is_hidden.is_(False))
                     .order_by(Landmark.id).all())
        total = len(landmarks)
        if total == 0:
            print("이 구에 일반 관광지가 없음 — seed_landmarks 먼저 실행하세요.")
            return

        print(f"대상 구: {district.name_ko}({district.name_en}) — 일반 관광지 {total}개\n")
        print(f"{'목표%':>6} | {'찍는 개수':>8} | {'실제%':>7} | token")
        print("-" * 100)

        for pct in STEPS:
            stamped_count = round(pct / 100 * total)
            user = User(is_guest=True, display_name=f"progress-demo-{pct}", lang="ko")
            db.add(user)
            db.flush()  # user.id 확보

            for lm in landmarks[:stamped_count]:
                db.add(Stamp(user_id=user.id, landmark_id=lm.id, is_hidden=False))
            db.commit()

            actual_pct = round(stamped_count / total * 100, 1)
            token = create_jwt(user.id)
            print(f"{pct:>5}% | {stamped_count:>8} | {actual_pct:>6}% | {token}")

        print("\n토큰을 /docs의 Authorize에 넣고 GET /api/stamps/progress 로 확인하세요.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
