"""Prediction task - generates price predictions for all active routes."""

import asyncio
import logging
import sys
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from pipeline.config import pipeline_settings
from pipeline.ml.models.statistical_model import StatisticalPredictor

logger = logging.getLogger(__name__)

# Ensure backend is importable
_project_root = Path(__file__).parent.parent.parent
if str(_project_root / "backend") not in sys.path:
    sys.path.insert(0, str(_project_root / "backend"))


def _get_session_factory() -> async_sessionmaker[AsyncSession]:
    engine = create_async_engine(pipeline_settings.DATABASE_URL)
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def _predict_all_routes() -> dict:
    """Run predictions for all active routes with sufficient data."""
    from app.models.flight_price import FlightPrice
    from app.models.prediction import Prediction
    from app.models.route import Route

    session_factory = _get_session_factory()
    predictor = StatisticalPredictor()

    predictions_created = 0
    routes_processed = 0

    async with session_factory() as session:
        # Get active routes
        result = await session.execute(select(Route).where(Route.is_active.is_(True)))
        routes = result.scalars().all()

        if not routes:
            return {"status": "ok", "routes": 0, "predictions": 0}

        today = date.today()
        # Predict for departure dates 7-60 days out
        target_dates = [today + timedelta(days=d) for d in range(7, 61, 7)]

        for route in routes:
            routes_processed += 1

            # Get price history for this route (last 90 days of collected data)
            prices_result = await session.execute(
                select(FlightPrice)
                .where(
                    FlightPrice.route_id == route.id,
                    FlightPrice.time >= datetime.now(timezone.utc) - timedelta(days=90),
                )
                .order_by(FlightPrice.time.asc())
            )
            price_rows = prices_result.scalars().all()

            if len(price_rows) < 3:
                continue  # Not enough data

            # Build DataFrame
            price_df = pd.DataFrame([
                {"time": p.time, "price_amount": float(p.price_amount), "airline_code": p.airline_code}
                for p in price_rows
            ])

            for dep_date in target_dates:
                # Filter prices relevant to this departure date
                relevant = price_df[
                    (price_df["time"] <= datetime.now(timezone.utc))
                ].copy()

                if len(relevant) < 3:
                    continue

                # Run statistical prediction
                result_pred = predictor.predict(relevant, forecast_days=14)
                if result_pred is None:
                    continue

                # Upsert prediction
                existing = await session.execute(
                    select(Prediction).where(
                        Prediction.route_id == route.id,
                        Prediction.departure_date == dep_date,
                        Prediction.cabin_class == "ECONOMY",
                        Prediction.model_version == "statistical-v1",
                    )
                )
                pred = existing.scalar_one_or_none()

                valid_until = datetime.now(timezone.utc) + timedelta(hours=2)

                if pred:
                    pred.predicted_price = result_pred["predicted_price"]
                    pred.confidence_low = result_pred["confidence_low"]
                    pred.confidence_high = result_pred["confidence_high"]
                    pred.price_direction = result_pred["price_direction"]
                    pred.confidence_score = Decimal(str(result_pred["confidence_score"]))
                    pred.predicted_at = datetime.now(timezone.utc)
                    pred.valid_until = valid_until
                else:
                    pred = Prediction(
                        route_id=route.id,
                        departure_date=dep_date,
                        cabin_class="ECONOMY",
                        predicted_price=result_pred["predicted_price"],
                        confidence_low=result_pred["confidence_low"],
                        confidence_high=result_pred["confidence_high"],
                        price_direction=result_pred["price_direction"],
                        confidence_score=Decimal(str(result_pred["confidence_score"])),
                        model_version="statistical-v1",
                        predicted_at=datetime.now(timezone.utc),
                        valid_until=valid_until,
                    )
                    session.add(pred)

                predictions_created += 1

        await session.commit()

    logger.info(f"Predictions: {routes_processed} routes, {predictions_created} predictions created")
    return {
        "status": "ok",
        "routes": routes_processed,
        "predictions": predictions_created,
    }


def predict_all_active_sync() -> dict:
    """Synchronous wrapper for APScheduler."""
    return asyncio.run(_predict_all_routes())


def retrain_models_sync() -> dict:
    """Retrain ML models with latest data (sync wrapper)."""
    # Statistical model doesn't need training
    # Prophet/GBM retraining would happen here when enough data accumulates
    logger.info("Model retraining check - statistical model requires no training")
    return {"status": "ok", "message": "Statistical model does not require training"}
