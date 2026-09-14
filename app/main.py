from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.api import meeting, preference, review, analysis

app = FastAPI(title="READLY AI Server")

# 인증 미들웨어를 먼저 추가 (나중에 실행됨)
@app.middleware("http")
async def verify_api_key(request: Request, call_next):
    if request.url.path == "/health":
        return await call_next(request)
    
    api_key = request.headers.get("X-AI-API-KEY")
    
    if api_key != settings.AI_API_KEY:
        return JSONResponse(
            status_code=401,
            content={"detail": "올바르지 않은 API 키입니다."}
        )
    
    return await call_next(request)

# CORS 미들웨어를 나중에 추가 (먼저 실행됨)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.BACKEND_ALLOWED_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(review.router)
app.include_router(preference.router)
app.include_router(meeting.router)
app.include_router(analysis.router)

@app.get("/health")
async def health():
    return {"status": "ok"}