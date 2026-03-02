import asyncio
import logging
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import jwt
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User
from app.schemas.user import UserCreate, UserLogin, UserResponse, TokenResponse

logger = logging.getLogger(__name__)


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


# Dummy hash for constant-time comparison when user doesn't exist
_DUMMY_HASH = bcrypt.hashpw(b"dummy", bcrypt.gensalt()).decode("utf-8")


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def register(self, user_data: UserCreate) -> UserResponse | None:
        result = await self.db.execute(select(User).where(User.email == user_data.email))
        if result.scalar_one_or_none():
            return None

        hashed_pw = await asyncio.to_thread(_hash_password, user_data.password)
        user = User(
            email=user_data.email,
            hashed_password=hashed_pw,
            display_name=user_data.display_name,
        )
        self.db.add(user)
        try:
            await self.db.flush()
            await self.db.commit()
        except IntegrityError:
            await self.db.rollback()
            logger.debug("Duplicate email registration attempt")
            return None
        return UserResponse.model_validate(user)

    async def login(self, credentials: UserLogin) -> TokenResponse | None:
        result = await self.db.execute(select(User).where(User.email == credentials.email))
        user = result.scalar_one_or_none()

        # Always run bcrypt to prevent timing-based user enumeration
        hashed = user.hashed_password if user else _DUMMY_HASH
        password_valid = await asyncio.to_thread(_verify_password, credentials.password, hashed)

        if not user or not password_valid:
            return None

        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
        token_data = {"sub": str(user.id), "exp": expire}
        access_token = jwt.encode(
            token_data, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
        )
        return TokenResponse(access_token=access_token)
