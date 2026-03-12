import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.alert import PriceAlert
from app.models.route import Route
from app.schemas.alert import AlertCreate, AlertResponse

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_ALERTS_PER_REQUEST = 200
_ROUTE_RETRY_DELAY = 0.05
_ROUTE_MAX_RETRIES = 4


@router.get("", response_model=list[AlertResponse])
async def get_alerts(
    db: AsyncSession = Depends(get_db),
) -> list[AlertResponse]:
    result = await db.execute(
        select(PriceAlert)
        .where(PriceAlert.user_id.is_(None))
        .order_by(PriceAlert.created_at.desc())
        .limit(MAX_ALERTS_PER_REQUEST)
    )
    alerts = result.scalars().all()

    # Batch load routes to avoid N+1 queries
    route_ids = list({a.route_id for a in alerts})
    routes_map: dict[int, Route] = {}
    if route_ids:
        routes_result = await db.execute(
            select(Route).where(Route.id.in_(route_ids))
        )
        routes_map = {r.id: r for r in routes_result.scalars().all()}

    responses = []
    for a in alerts:
        route = routes_map.get(a.route_id)
        responses.append(AlertResponse(
            id=a.id,
            route_id=a.route_id,
            origin=route.origin_code if route else None,
            destination=route.dest_code if route else None,
            target_price=a.target_price,
            cabin_class=a.cabin_class,
            departure_date=a.departure_date,
            is_triggered=a.is_triggered,
            triggered_at=a.triggered_at,
            created_at=a.created_at,
        ))
    return responses


@router.post("", response_model=AlertResponse, status_code=status.HTTP_201_CREATED)
async def create_alert(
    alert_data: AlertCreate,
    db: AsyncSession = Depends(get_db),
) -> AlertResponse:
    origin = alert_data.origin.upper()
    destination = alert_data.destination.upper()

    # Find or create route
    route_result = await db.execute(
        select(Route).where(Route.origin_code == origin, Route.dest_code == destination)
    )
    route = route_result.scalar_one_or_none()

    if not route:
        route = Route(origin_code=origin, dest_code=destination, is_active=True)
        db.add(route)
        try:
            await db.flush()
        except IntegrityError:
            await db.rollback()
            # Retry lookup with exponential backoff
            delay = _ROUTE_RETRY_DELAY
            for _ in range(_ROUTE_MAX_RETRIES):
                route_result = await db.execute(
                    select(Route).where(Route.origin_code == origin, Route.dest_code == destination)
                )
                route = route_result.scalar_one_or_none()
                if route:
                    break
                await asyncio.sleep(delay)
                delay *= 2
            if not route:
                raise HTTPException(status_code=400, detail="유효하지 않은 공항 코드이거나 노선 생성에 실패했습니다.")

    alert = PriceAlert(
        user_id=None,
        route_id=route.id,
        target_price=alert_data.target_price,
        cabin_class=alert_data.cabin_class,
        departure_date=alert_data.departure_date,
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    return AlertResponse(
        id=alert.id,
        route_id=alert.route_id,
        origin=route.origin_code,
        destination=route.dest_code,
        target_price=alert.target_price,
        cabin_class=alert.cabin_class,
        departure_date=alert.departure_date,
        is_triggered=alert.is_triggered,
        triggered_at=alert.triggered_at,
        created_at=alert.created_at,
    )


@router.delete("/{alert_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(PriceAlert).where(PriceAlert.id == alert_id)
    )
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="알림을 찾을 수 없습니다.")
    try:
        await db.delete(alert)
        await db.commit()
    except SQLAlchemyError as e:
        logger.error(f"Failed to delete alert {alert_id}: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(status_code=500, detail="알림 삭제에 실패했습니다.")
