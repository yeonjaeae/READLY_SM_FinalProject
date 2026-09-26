"""
1. 독후감 생성
사용자가 책을 읽으면서 남긴 (구절 phrase + 느낀점 feeling) 노트를
여러 개 받아서, GPT가 이를 종합해 하나의 독후감으로 작성합니다.
"""

from app.schemas.review import ReviewGenerateRequest
from app.services.openai_client import ask_gpt

SYSTEM_PROMPT = (
    "당신은 독서 에세이 작가입니다. "
    "사용자가 책을 읽으며 남긴 구절과 느낀점을 바탕으로, "
    "하나의 주제 의식이 흐르는 완성된 독후감 에세이를 씁니다. "
    "\n\n"
    "반드시 지켜야 할 규칙:\n"
    "1. 구절을 하나씩 나열하거나 순서대로 언급하지 않습니다. "
    "여러 구절과 느낀점에서 공통된 주제나 감정을 찾아 하나의 흐름으로 엮습니다.\n"
    "2. '먼저', '또한', '그리고', '마지막으로' 같은 나열식 접속어를 사용하지 않습니다.\n"
    "3. 사용자가 언급하지 않은 줄거리나 감상을 새로 지어내지 않습니다.\n"
    "4. 사용자의 어투와 감정을 살리되, 하나의 에세이처럼 자연스럽게 씁니다.\n"
    "5. 독후감은 도입부 → 핵심 감상 → 마무리 구조로 씁니다. 분량은 300~500자 내외입니다."
)


async def generate_review(req: ReviewGenerateRequest) -> str:
    notes_text = "\n\n".join(
        f"- 구절: {n.phrase}\n  느낀점: {n.feeling}" for n in req.notes
    )

    user_prompt = f"""
책 제목: {req.book_title}
저자: {req.author or "미상"}
원하는 문체: {req.tone}

[사용자가 남긴 구절 + 느낀점]
{notes_text}

위 노트들을 바탕으로, 구절을 나열하지 말고 하나의 흐름 있는 독후감 에세이를 작성해줘.
공통된 주제나 감정을 중심으로 자연스럽게 이어지는 글로 써줘.
""".strip()

    return await ask_gpt(SYSTEM_PROMPT, user_prompt)