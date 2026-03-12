import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import EMAIL_ALREADY_EXISTS_MSG, INVALID_CREDENTIALS_MSG
from app.db.session import get_db
from app.schemas.user import UserCreate, UserLogin, UserResponse, TokenResponse
from app.services.auth_service import AuthService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, db: AsyncSession = Depends(get_db)) -> UserResponse:
    service = AuthService(db)
    user = await service.register(user_data)
    if not user:
        logger.warning(f"Registration failed - duplicate email: {user_data.email}")
        raise HTTPException(status_code=400, detail=EMAIL_ALREADY_EXISTS_MSG)
    logger.info(f"New user registered: {user_data.email}")
    return user


@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    service = AuthService(db)
    token = await service.login(credentials)
    if not token:
        logger.warning(f"Failed login attempt: {credentials.email}")
        raise HTTPException(status_code=401, detail=INVALID_CREDENTIALS_MSG)
    return token
