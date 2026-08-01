"""Mātch K API 엔트리포인트.

로컬 실행: uvicorn app.main:app --reload
Railway: 시작 커맨드 uvicorn app.main:app --host 0.0.0.0 --port $PORT
"""
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.database import Base, engine
from app.routers import (
    auth, health, hidden, itineraries, landmarks, recommendations, search, stamps, users,
)
from app.services.tourapi_client import TourApiError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("matchk")

app = FastAPI(title="Mātch K API", version="0.1.0")

# 개발 편의용 — 프로덕션은 Alembic 마이그레이션 사용 (D2 [B])
Base.metadata.create_all(bind=engine)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # MVP: Expo 개발 서버 편의. 배포 전 축소 (D9 [B])
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (health.router, auth.router, landmarks.router, stamps.router,
               recommendations.router, search.router, users.router, hidden.router,
               itineraries.router):
    app.include_router(router)


@app.exception_handler(TourApiError)
async def tourapi_error_handler(request: Request, exc: TourApiError):
    """에러 응답 표준화 (D9 [B]) — TourAPI 장애/한도 초과를 사용자 문구로 변환."""
    logger.error("TourAPI error on %s: %s", request.url.path, exc)
    return JSONResponse(status_code=502, content={
        "error": "tour_api_unavailable",
        "message": "Tourism data is temporarily unavailable. Please try again.",
    })
