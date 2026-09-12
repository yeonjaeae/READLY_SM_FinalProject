from fastapi import APIRouter
from pydantic import BaseModel
from openai import AsyncOpenAI
import json

from app.core.config import settings

router = APIRouter(prefix="/api/analysis", tags=["analysis"])

# 비동기 OpenAI 클라이언트 초기화
client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

# 요청 데이터 구조 정의
class EmotionTagRequest(BaseModel):
    review: str  # 독후감 텍스트

# 응답 데이터 구조 정의
class EmotionTagResponse(BaseModel):
    emotion_tags: list[str]  # 감정 태그 리스트

@router.post("/emotion-tags", response_model=EmotionTagResponse)
async def generate_emotion_tags(req: EmotionTagRequest):
    """
    req.review: AI가 생성한 독후감 텍스트
    return: 감정 태그 리스트 (최대 5개)
    """
    response = await client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=[
            {
                "role": "system",
                "content": """당신은 독서 감정 분석 전문가입니다.
                독후감을 읽고 독자가 느낀 감정을 짧은 태그로 추출해주세요.
                
                규칙:
                1. 태그는 최대 5개
                2. 각 태그는 2~4글자의 한국어 감정 단어
                3. 반드시 아래 JSON 형식으로만 답변
                
                예시 출력:
                {"tags": ["감동", "여운", "슬픔", "공감", "따뜻함"]}"""
            },
            {
                "role": "user",
                "content": f"다음 독후감에서 감정 태그를 추출해주세요:\n\n{req.review}"
            }
        ],
        # JSON 형식으로만 응답하도록 강제
        response_format={"type": "json_object"}
    )

    # GPT 응답에서 JSON 파싱
    result = json.loads(response.choices[0].message.content)
    return EmotionTagResponse(emotion_tags=result.get("tags", []))