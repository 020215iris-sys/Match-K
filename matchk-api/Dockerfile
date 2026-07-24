# Mātch K API — 팀 공통 개발/배포 이미지 (Railway도 이 Dockerfile 인식)
FROM python:3.10-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
# Railway는 $PORT를 주입하므로 배포 시엔 --port $PORT 로 오버라이드
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
