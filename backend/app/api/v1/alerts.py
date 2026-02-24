from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.alert import AlertCreate, AlertResponse

router = APIRouter()


@router.get("", response_model=list[AlertResponse])
async def get_alerts(db: AsyncSession = Depends(get_db)) -> list[AlertResponse]:
    # TODO: Get user_id from auth token
    return []


@router.post("", response_model=AlertResponse, status_code=status.HTTP_201_CREATED)
async def create_alert(
    alert_data: AlertCreate, db: AsyncSession = Depends(get_db)
) -> AlertResponse:
    # TODO: Implement with auth
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert(alert_id: int, db: AsyncSession = Depends(get_db)) -> None:
    # TODO: Implement with auth
    raise HTTPException(status_code=501, detail="Not implemented yet")
