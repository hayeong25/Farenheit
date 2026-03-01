"""Prediction task - generates price predictions for all active routes."""

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pandas as pd
from sqlalchemy import select

from pipeline.db import session_factory as _session_factory
from pipeline.ml.models.statistical_model import StatisticalPredictor

logger = logging.getLogger(__name__)


async def _predict_all_routes() -> dict:
    """Run predictions for all active routes with sufficient data."""
    from app.models.flight_price import FlightPrice
    from app.models.prediction import Prediction
    from app.models.route import Route

    session_factory = _session_factory
    predictor = StatisticalPredictor()

    predictions_created = 0
    routes_processed = 0
    routes_failed = 0

    async with session_factory() as session:
        # Get active routes
        result = await session.execute(select(Route).where(Route.is_active.is_(True)))
        routes = result.scalars().all()

        if not routes:
            return {"status": "ok", "routes": 0, "predictions": 0}

        now_utc = datetime.now(timezone.utc)
        today = now_utc.date()
        # Predict for departure dates 7-60 days out (every 3 days for accuracy)
        target_dates = [today + timedelta(days=d) for d in range(7, 61, 3)]

        for route in routes:
            routes_processed += 1

            try:
                # Get price history for this route (last 90 days of collected data)
                prices_result = await session.execute(
                    select(FlightPrice)
                    .where(
                        FlightPrice.route_id == route.id,
                        FlightPrice.time >= now_utc - timedelta(days=90),
                    )
                    .order_by(FlightPrice.time.asc())
                )
                price_rows = prices_result.scalars().all()

                if len(price_rows) < 3:
                    logger.debug(f"Route {route.origin_code}->{route.dest_code}: skipped (only {len(price_rows)} price points)")
                    continue

                # Build DataFrame with departure_date for per-date filtering
                price_df = pd.DataFrame([
                    {
                        "time": p.time,
                        "price_amount": float(p.price_amount),
                        "airline_code": p.airline_code,
                        "departure_date": p.departure_date,
                    }
                    for p in price_rows
                ])

                # Determine dominant airline for this route (deterministic: alphabetical on tie)
                airline_counts = price_df["airline_code"].value_counts()
                if len(airline_counts) > 0:
                    max_count = airline_counts.iloc[0]
                    top_airlines = airline_counts[airline_counts == max_count].index.tolist()
                    dominant_airline = sorted(top_airlines)[0]  # alphabetical tiebreak
                else:
                    dominant_airline = None

                for dep_date in target_dates:
                    # Prefer departure-date-specific prices; fall back to all route prices
                    dep_specific = price_df[
                        (price_df["time"] <= now_utc) & (price_df["departure_date"] == dep_date)
                    ]
                    if len(dep_specific) >= 3:
                        relevant = dep_specific.copy()
                    else:
                        # Fall back to all prices for this route (better than nothing)
                        relevant = price_df[price_df["time"] <= now_utc].copy()

                    if len(relevant) < 3:
                        continue

                    # Adjust forecast horizon based on days until departure
                    days_until = (dep_date - today).days
                    forecast_days = max(min(days_until, 14), 1)

                    # Run statistical prediction
                    result_pred = predictor.predict(relevant, forecast_days=forecast_days)
                    if result_pred is None:
                        logger.warning(f"Route {route.origin_code}->{route.dest_code} date {dep_date}: prediction returned None with {len(relevant)} data points")
                        continue

                    # Ensure non-negative prices and valid confidence interval
                    for key in ("predicted_price", "confidence_low", "confidence_high"):
                        if result_pred[key] < 0:
                            result_pred[key] = Decimal("0")
                    # Ensure confidence_low <= predicted_price <= confidence_high
                    if result_pred["confidence_low"] > result_pred["predicted_price"]:
                        result_pred["confidence_low"] = result_pred["predicted_price"]
                    if result_pred["confidence_high"] < result_pred["predicted_price"]:
                        result_pred["confidence_high"] = result_pred["predicted_price"]

                    # Upsert prediction (match all UniqueConstraint fields)
                    # Build WHERE clause - handle NULL airline_code properly
                    airline_filter = (
                        Prediction.airline_code.is_(None)
                        if dominant_airline is None
                        else Prediction.airline_code == dominant_airline
                    )
                    existing = await session.execute(
                        select(Prediction).where(
                            Prediction.route_id == route.id,
                            airline_filter,
                            Prediction.departure_date == dep_date,
                            Prediction.cabin_class == "ECONOMY",
                            Prediction.model_version == "statistical-v1",
                        )
                    )
                    pred = existing.scalar_one_or_none()

                    valid_until = now_utc + timedelta(hours=2)

                    if pred:
                        pred.predicted_price = result_pred["predicted_price"]
                        pred.confidence_low = result_pred["confidence_low"]
                        pred.confidence_high = result_pred["confidence_high"]
                        pred.price_direction = result_pred["price_direction"]
                        pred.confidence_score = Decimal(str(result_pred["confidence_score"]))
                        pred.predicted_at = now_utc
                        pred.valid_until = valid_until
                    else:
                        pred = Prediction(
                            route_id=route.id,
                            airline_code=dominant_airline,
                            departure_date=dep_date,
                            cabin_class="ECONOMY",
                            predicted_price=result_pred["predicted_price"],
                            confidence_low=result_pred["confidence_low"],
                            confidence_high=result_pred["confidence_high"],
                            price_direction=result_pred["price_direction"],
                            confidence_score=Decimal(str(result_pred["confidence_score"])),
                            model_version="statistical-v1",
                            predicted_at=now_utc,
                            valid_until=valid_until,
                        )
                        session.add(pred)

                    predictions_created += 1

            except Exception as e:
                routes_failed += 1
                logger.error(f"Route {route.origin_code}->{route.dest_code}: prediction failed: {e}", exc_info=True)
                continue

        try:
            await session.commit()
        except Exception as e:
            logger.error(f"Failed to commit {predictions_created} predictions: {e}", exc_info=True)
            await session.rollback()
            return {"status": "error", "routes": routes_processed, "predictions": 0}

    logger.info(f"Predictions: {routes_processed} routes, {predictions_created} predictions created, {routes_failed} failed")
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
