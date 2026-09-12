"""
AI 서버 진입점.

실행:
    uvicorn app.main:app --reload --port 8001
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.api import meeting, preference, review, analysis

# app 먼저 정의
app = FastAPI(title="READLY AI Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.BACKEND_ALLOWED_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 백엔드 요청 인증 미들웨어
# 모든 요청에 대해 X-AI-API-KEY 헤더가 올바른지 확인
@app.middleware("http")
async def verify_api_key(request: Request, call_next):
    # /health 엔드포인트는 인증 없이 접근 가능 (서버 상태 확인용)
    if request.url.path == "/health":
        return await call_next(request)
    
    # 요청 헤더에서 X-AI-API-KEY 값 읽기
    api_key = request.headers.get("X-AI-API-KEY")
    
    # 키가 없거나 틀리면 401 에러 반환
    if api_key != settings.AI_API_KEY:
        return JSONResponse(
            status_code=401,
            content={"detail": "올바르지 않은 API 키입니다."}
        )
    
    return await call_next(request)

# 라우터는 app 정의 후에 추가
app.include_router(review.router)
app.include_router(preference.router)
app.include_router(meeting.router)
app.include_router(analysis.router)

@app.get("/health")
async def health():
    return {"status": "ok"}