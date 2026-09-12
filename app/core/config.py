"""
앱 전역 설정.
.env 파일 값을 읽어서 사용합니다. (python-dotenv + pydantic-settings)
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    OPENAI_API_KEY: str
    OPENAI_MODEL: str = "gpt-4o"
    APP_PORT: int = 8001
    BACKEND_ALLOWED_ORIGIN: str = "*"
    # 백엔드에서 AI 서버 호출 시 사용하는 인증 키
    AI_API_KEY: str = "default-readly-key"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()