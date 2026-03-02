import calendar
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prediction import Prediction
from app.models.route import Route
from app.models.flight_price import FlightPrice
from app.schemas.prediction import (
    ForecastPoint,
    HeatmapCell,
    HeatmapResponse,
    PredictionResponse,
)

_ZERO = Decimal("0")


def _classify_price_level(value: float, min_p: float, max_p: float) -> str:
    """Classify a price into LOW / MEDIUM / HIGH relative to the range."""
    price_range = max_p - min_p
    if price_range <= 0:
        return "LOW"
    ratio = (value - min_p) / price_range
    return "LOW" if ratio < 0.33 else ("MEDIUM" if ratio < 0.66 else "HIGH")


class PredictionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _build_forecast_series(
        self, route_id: int, cabin_class: str
    ) -> list[ForecastPoint]:
        """Query future predictions for the same route/cabin and return deduplicated series."""
        now = datetime.now(timezone.utc)
        today = now.date()

        result = await self.db.execute(
            select(Prediction)
            .where(
                Prediction.route_id == route_id,
                Prediction.cabin_class == cabin_class,
                Prediction.departure_date >= today,
                Prediction.valid_until >= now,
                Prediction.predicted_price.isnot(None),
            )
            .order_by(Prediction.departure_date, Prediction.predicted_at.desc())
        )
        rows = result.scalars().all()

        # Deduplicate by departure_date — keep the first (latest predicted_at) per date
        seen: set[date] = set()
        points: list[ForecastPoint] = []
        for row in rows:
            if row.departure_date in seen:
                continue
            seen.add(row.departure_date)
            price = max(row.predicted_price, _ZERO)
            low = max(row.confidence_low, _ZERO) if row.confidence_low is not None else price
            high = max(row.confidence_high, _ZERO) if row.confidence_high is not None else price
            # Ensure low <= price <= high
            low = min(low, price)
            high = max(high, price)
            points.append(
                ForecastPoint(
                    date=row.departure_date,
                    predicted_price=price,
                    confidence_low=low,
                    confidence_high=high,
                )
            )
        return points

    async def get_prediction(
        self, route_id: int, departure_date: date, cabin_class: str
    ) -> PredictionResponse:
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            select(Prediction)
            .where(
                Prediction.route_id == route_id,
                Prediction.departure_date == departure_date,
                Prediction.cabin_class == cabin_class,
                Prediction.valid_until >= now,
            )
            .order_by(Prediction.predicted_at.desc())
            .limit(1)
        )
        pred = result.scalar_one_or_none()

        forecast = await self._build_forecast_series(route_id, cabin_class)

        if not pred:
            return PredictionResponse(
                route_id=route_id,
                departure_date=departure_date,
                cabin_class=cabin_class,
                predicted_price=None,
                confidence_low=None,
                confidence_high=None,
                price_direction="STABLE",
                confidence_score=None,
                model_version="none",
                predicted_at=None,
                forecast_series=forecast,
            )

        return PredictionResponse(
            route_id=pred.route_id,
            departure_date=pred.departure_date,
            cabin_class=pred.cabin_class,
            predicted_price=pred.predicted_price,
            confidence_low=pred.confidence_low,
            confidence_high=pred.confidence_high,
            price_direction=pred.price_direction,
            confidence_score=pred.confidence_score,
            model_version=pred.model_version,
            predicted_at=pred.predicted_at,
            forecast_series=forecast,
        )

    async def get_heatmap(
        self, origin: str, dest: str, month: str, cabin_class: str = "ECONOMY"
    ) -> HeatmapResponse:
        """Generate price heatmap for a given month.

        Shows predicted prices for each day of the month,
        categorized by how far in advance the booking is.
        """
        # Find route
        route_result = await self.db.execute(
            select(Route).where(Route.origin_code == origin, Route.dest_code == dest)
        )
        route = route_result.scalar_one_or_none()

        if not route:
            return HeatmapResponse(origin=origin, destination=dest, month=month, cells=[])

        # Parse month with validation
        try:
            year, mon = int(month[:4]), int(month[5:7])
        except (ValueError, IndexError):
            return HeatmapResponse(origin=origin, destination=dest, month=month, cells=[])
        if mon < 1 or mon > 12 or year < 2000 or year > 2100:
            return HeatmapResponse(origin=origin, destination=dest, month=month, cells=[])
        _, days_in_month = calendar.monthrange(year, mon)

        cells: list[HeatmapCell] = []

        # Get all predictions for this route in this month
        month_start = date(year, mon, 1)
        month_end = date(year, mon, days_in_month)

        now = datetime.now(timezone.utc)
        today = now.date()
        result = await self.db.execute(
            select(Prediction)
            .where(
                Prediction.route_id == route.id,
                Prediction.departure_date >= month_start,
                Prediction.departure_date <= month_end,
                Prediction.cabin_class == cabin_class,
                Prediction.valid_until >= now,
                Prediction.predicted_price.isnot(None),
            )
            .order_by(Prediction.departure_date, Prediction.predicted_at.desc())
        )
        all_predictions = result.scalars().all()

        # Deduplicate by departure_date — keep latest predicted_at per date
        seen_dates: set[date] = set()
        predictions: list[Prediction] = []
        for p in all_predictions:
            if p.departure_date not in seen_dates:
                seen_dates.add(p.departure_date)
                predictions.append(p)
        if predictions:
            # Get min/max for price level categorization
            prices_dec = [max(p.predicted_price, _ZERO) for p in predictions]
            min_p, max_p = float(min(prices_dec)), float(max(prices_dec))

            for pred in predictions:
                weeks = max(0, (pred.departure_date - today).days // 7)
                price_val = max(pred.predicted_price, _ZERO)
                level = _classify_price_level(float(price_val), min_p, max_p)

                cells.append(HeatmapCell(
                    departure_date=pred.departure_date,
                    weeks_before=weeks,
                    predicted_price=price_val,
                    price_level=level,
                ))
        else:
            # Fallback: use actual price data to generate heatmap
            price_result = await self.db.execute(
                select(
                    FlightPrice.departure_date,
                    func.min(FlightPrice.price_amount).label("min_price"),
                )
                .where(
                    FlightPrice.route_id == route.id,
                    FlightPrice.departure_date >= month_start,
                    FlightPrice.departure_date <= month_end,
                    FlightPrice.cabin_class == cabin_class,
                )
                .group_by(FlightPrice.departure_date)
                .order_by(FlightPrice.departure_date)
            )
            price_rows = price_result.all()

            if price_rows:
                prices = [float(r.min_price) for r in price_rows]
                min_p, max_p = min(prices), max(prices)

                for row in price_rows:
                    weeks = max(0, (row.departure_date - today).days // 7)
                    price_val = float(row.min_price)
                    level = _classify_price_level(price_val, min_p, max_p)

                    cells.append(HeatmapCell(
                        departure_date=row.departure_date,
                        weeks_before=weeks,
                        predicted_price=Decimal(str(round(price_val))),
                        price_level=level,
                    ))

        return HeatmapResponse(origin=origin, destination=dest, month=month, cells=cells)
