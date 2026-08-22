"""히든 장소 지정 — 전 구를 대상으로 '가장 숨은' 장소 일부만 is_hidden=True로.

기준 (팀 회의로 조정 가능):
1. 후보  : 영·일·중 3개 언어 모두 미등록 (= 외국인에게 사실상 안 알려진 곳)
           단, 현재 TourAPI 목록에 없어 판정 불가(cov=None)한 장소는 후보에서 제외
2. 순위  : 대표이미지 없는 곳 우선(더 숨은 곳). 동점은 contentid 순 = 실행마다 동일 결과
3. 상한  : 구별로 min(후보수, 전체×비율, 전체−MIN_NORMAL_PER_DISTRICT) 개만 지정
           비율은 소멸위험 구가 일반 구의 2배 (컨셉상 소멸위험 지역 강조 유지)

▸ 8/4 §7 문제 1 대응. 기존 코드는 (a) 대상을 소멸위험 구로 한정하고 (b) 상한이 없어서,
  3개 구가 통째로 히든이 되고 나머지 13개 구는 히든이 0이었다. 그 결과:
    - 세 구는 일반 도장이 0개 → stamps.py progress의 INNER JOIN에 걸려
      업적지도 구 목록에서 **아예 사라진다** (회색으로 남는 게 아님)
    - 구별 진행률이 0.0 고정 → hiddenReady가 언제나 거짓 → 히든 팝업 발동 불가
    - 히든 미션이 3구 전용 기능이 되어 나머지 지역에는 존재하지 않음
  → 범위를 전 구로 넓히고(문제 b) 구별 상한을 걸어(문제 a) 둘 다 해소한다.

▸ 2026-08-19 실측: 외국어 서비스(Eng/Jpn/Chs) 미승인 상태에서는 커버리지가 전부 빈 값이라
  모든 장소가 '미등록'으로 판정돼 소멸위험 구 32곳이 전량 히든이 됐다. 승인 후 25곳으로
  줄었고, 여기에 구별 상한을 적용해 최종 31곳(14개 구 분포)이 된다.

▸ '방문자수 하위'를 순위 기준으로 쓰지 않은 이유: 방문자수(DataLabService)는 시군구 단위라
  같은 구 안의 장소가 전부 동일 값이 되어 순위가 매겨지지 않는다.
  ▸ 한계: 대표이미지 신호는 일부 구(동구 등)에서 후보 전원이 이미지를 가져 무의미해진다.
    그 구에서는 contentid 순으로 결정된다. 후속 개선 후보 = 집중률(TatsCnctrRateService).

▸ 소멸위험 구 판정은 District.is_declining 컬럼을 쓴다 (seed_landmarks가 채움).

재실행해도 안전하다 (매번 전체를 False로 초기화한 뒤 다시 지정).
비율 변경 전에 python -m app.scripts.hidden_sim 으로 예상 건수를 확인할 것.

실행: python -m app.scripts.mark_hidden
"""
import asyncio
import math

from app.core.database import SessionLocal
from app.models import District, Landmark
from app.services import lang_mapping, tourapi_client

# ── 히든 상한 (팀 회의 조정 대상) ────────────────────────────────────
# config.py는 공용 파일(단독 PR 대상)이라 스크립트 지역 상수로 둔다.
# 확정되면 config.py로 옮길지 현표님과 합의.
HIDDEN_RATIO_DECLINING = 0.4   # 소멸위험 구(동5·서11·영도14) 히든 최대 비율
HIDDEN_RATIO_NORMAL = 0.2      # 그 외 13개 구
MIN_NORMAL_PER_DISTRICT = 3    # 구별로 일반 도장을 최소 이만큼 남긴다


async def main() -> None:
    db = SessionLocal()
    try:
        districts = db.query(District).all()
        if not districts:
            print("구가 시드되지 않음 — seed_landmarks 먼저 실행")
            return

        # 국문 후보 전체를 외국어 등록부와 대조 (coverage)
        raw = []
        for page in (1, 2, 3):
            batch = await tourapi_client.list_by_area("ko", page=page, content_type_id=12,
                                                      use_long_cache=True)
            raw.extend(batch)
            if len(batch) < 100:
                break
        coverage = await lang_mapping.coverage_by_contentid(raw)
        # 대표이미지 유무 — 순위용 장소 단위 신호 (없을수록 '더 숨은 곳')
        has_image = {
            str(i.get("contentid")): bool(i.get("firstimage") or i.get("firstimage2"))
            for i in raw
        }

        marked = 0
        unjudged = 0
        detail = []
        for d in sorted(districts, key=lambda x: x.sigungu_code):
            lms = db.query(Landmark).filter(Landmark.district_id == d.id).all()
            total = len(lms)

            # 1) 후보 선별 — 외국어 3개 모두 미등록
            candidates = []
            for lm in lms:
                cid = str(lm.contentid)
                lm.is_hidden = False          # 재실행 대비 초기화
                cov = coverage.get(cid)
                if cov is None:
                    # DB에는 있으나 현재 TourAPI 목록에 없는 장소 → 등록 여부 판정 불가.
                    # 근거 없이 히든으로 지정하지 않고 건너뛴다. (2026-08-19 기준 13건)
                    unjudged += 1
                    continue
                if not any(cov.get(l) for l in lang_mapping.FOREIGN_LANGS):
                    candidates.append(lm)

            # 2) 순위 — 대표이미지 없는 곳 우선, 동점은 contentid 순(결정적 정렬)
            candidates.sort(key=lambda l: (has_image.get(str(l.contentid), False),
                                           str(l.contentid)))

            # 3) 상한 — 구마다 일반 도장을 반드시 남긴다
            ratio = HIDDEN_RATIO_DECLINING if d.is_declining else HIDDEN_RATIO_NORMAL
            n_hidden = min(len(candidates),
                           math.floor(total * ratio),
                           max(total - MIN_NORMAL_PER_DISTRICT, 0))
            for lm in candidates[:n_hidden]:
                lm.is_hidden = True

            marked += n_hidden
            detail.append((d.sigungu_code, total, len(candidates), n_hidden, d.is_declining))

        db.commit()

        print(f"히든 지정 완료: {marked}건 "
              f"(소멸위험 {HIDDEN_RATIO_DECLINING:.0%} / 일반 {HIDDEN_RATIO_NORMAL:.0%}, "
              f"구별 일반 최소 {MIN_NORMAL_PER_DISTRICT}곳)")
        if unjudged:
            print(f"  ※ 판정 불가로 제외 {unjudged}건 (DB에는 있으나 현재 TourAPI 목록에 없음)")
        for code, total, n_cand, n, is_dec in detail:
            mark = "★" if is_dec else " "
            print(f"  {mark}구{code:>2}: 전체{total:>3} 후보{n_cand:>3} → 히든{n:>2} 일반{total - n:>3}")
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())