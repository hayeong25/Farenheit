from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User
from app.schemas.user import UserCreate, UserLogin, UserResponse, TokenResponse

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def register(self, user_data: UserCreate) -> UserResponse | None:
        result = await self.db.execute(select(User).where(User.email == user_data.email))
        if result.scalar_one_or_none():
            return None

        user = User(
            email=user_data.email,
            hashed_password=pwd_context.hash(user_data.password),
            display_name=user_data.display_name,
        )
        self.db.add(user)
        await self.db.flush()
        return UserResponse.model_validate(user)

    async def login(self, credentials: UserLogin) -> TokenResponse | None:
        result = await self.db.execute(select(User).where(User.email == credentials.email))
        user = result.scalar_one_or_none()

        if not user or not pwd_context.verify(credentials.password, user.hashed_password):
            return None

        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
        token_data = {"sub": str(user.id), "exp": expire}
        access_token = jwt.encode(
            token_data, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
        )
        return TokenResponse(access_token=access_token)
