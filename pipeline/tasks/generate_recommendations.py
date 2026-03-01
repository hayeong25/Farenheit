"""Recommendation readiness check - verifies predictions are available for active routes."""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func

from pipeline.db import session_factory as _session_factory

logger = logging.getLogger(__name__)


async def _check_recommendation_readiness() -> dict:
    """Check that predictions exist for active routes (recommendations are served on-demand)."""
    from app.models.prediction import Prediction
    from app.models.route import Route

    session_factory = _session_factory
    now = datetime.now(timezone.utc)

    async with session_factory() as session:
        # Count active routes
        route_count_result = await session.execute(
            select(func.count(Route.id)).where(Route.is_active.is_(True))
        )
        active_routes = route_count_result.scalar() or 0

        # Count valid predictions (not expired)
        pred_count_result = await session.execute(
            select(func.count(Prediction.id)).where(Prediction.valid_until >= now)
        )
        valid_predictions = pred_count_result.scalar() or 0

        # Count routes with at least one valid prediction
        routes_with_preds_result = await session.execute(
            select(func.count(func.distinct(Prediction.route_id))).where(
                Prediction.valid_until >= now
            )
        )
        routes_with_predictions = routes_with_preds_result.scalar() or 0

    coverage = (
        round(routes_with_predictions / active_routes * 100, 1)
        if active_routes > 0
        else 0
    )
    logger.info(
        f"Recommendation readiness: {routes_with_predictions}/{active_routes} routes covered "
        f"({coverage}%), {valid_predictions} valid predictions"
    )

    return {
        "status": "ok",
        "active_routes": active_routes,
        "routes_with_predictions": routes_with_predictions,
        "valid_predictions": valid_predictions,
        "coverage_pct": coverage,
    }


def generate_all_sync() -> dict:
    """Synchronous wrapper for APScheduler."""
    return asyncio.run(_check_recommendation_readiness())
