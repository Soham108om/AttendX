from typing import List
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    AttendX Application Configuration.
    Loads from environment variables and local .env files safely.
    """
    APP_ENV: str = Field(default="development", description="Environment: development, staging, production")
    APP_NAME: str = Field(default="AttendX API", description="Service title")
    API_V1_PREFIX: str = Field(default="/api/v1", description="API v1 routing prefix")
    FRONTEND_ORIGIN: str = Field(default="http://localhost:5173", description="Allowed CORS origin for frontend")

    # Supabase Credentials (Optional at boot time so app can run health checks safely)
    SUPABASE_URL: str = Field(default="", description="Supabase project URL")
    SUPABASE_ANON_KEY: str = Field(default="", description="Supabase public anon key")
    SUPABASE_SERVICE_ROLE_KEY: str = Field(default="", description="Supabase backend service role key")
    ATTENDANCE_ATTESTATION_SECRET: str = Field(
        default="",
        repr=False,
        description="Server-only HMAC key shared with Supabase Vault for verified attendance.",
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins(self) -> List[str]:
        origins = [self.FRONTEND_ORIGIN.rstrip("/")]
        # Also include standard localhost variants if in development
        if self.APP_ENV == "development":
            origins.extend([
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://10.207.121.160:5173",
                "http://localhost:3000",
                "http://127.0.0.1:3000",
            ])
        return list(set(origins))


settings = Settings()
