import calendar
from datetime import date, datetime, timedelta, timezone
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


class PredictionService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_prediction(
        self, route_id: int, departure_date: date, cabin_class: str
    ) -> PredictionResponse:
        result = await self.db.execute(
            select(Prediction)
            .where(
                Prediction.route_id == route_id,
                Prediction.departure_date == departure_date,
                Prediction.cabin_class == cabin_class,
            )
            .order_by(Prediction.predicted_at.desc())
            .limit(1)
        )
        pred = result.scalar_one_or_none()

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
                forecast_series=[],
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
            forecast_series=[],
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

        # Parse month
        year, mon = int(month[:4]), int(month[5:7])
        _, days_in_month = calendar.monthrange(year, mon)

        cells: list[HeatmapCell] = []

        # Get all predictions for this route in this month
        month_start = date(year, mon, 1)
        month_end = date(year, mon, days_in_month)

        result = await self.db.execute(
            select(Prediction)
            .where(
                Prediction.route_id == route.id,
                Prediction.departure_date >= month_start,
                Prediction.departure_date <= month_end,
                Prediction.cabin_class == cabin_class,
            )
            .order_by(Prediction.departure_date)
        )
        predictions = result.scalars().all()

        # Filter out predictions with null prices
        predictions = [p for p in predictions if p.predicted_price is not None]

        # If we have predictions, use them
        if predictions:
            # Get min/max for price level categorization
            prices = [float(p.predicted_price) for p in predictions]
            min_p, max_p = min(prices), max(prices)
            price_range = max_p - min_p if max_p > min_p else 1

            for pred in predictions:
                today = date.today()
                weeks = max(0, (pred.departure_date - today).days // 7)
                price_val = float(pred.predicted_price)

                # Categorize price level
                if price_range > 0:
                    ratio = (price_val - min_p) / price_range
                    level = "LOW" if ratio < 0.33 else ("MEDIUM" if ratio < 0.66 else "HIGH")
                else:
                    level = "MEDIUM"

                cells.append(HeatmapCell(
                    departure_date=pred.departure_date,
                    weeks_before=weeks,
                    predicted_price=pred.predicted_price,
                    price_level=level,
                ))
        else:
            # Fallback: use actual price data to generate heatmap
            price_result = await self.db.execute(
                select(
                    FlightPrice.departure_date,
                    func.min(FlightPrice.price_amount).label("min_price"),
                    func.avg(FlightPrice.price_amount).label("avg_price"),
                )
                .where(
                    FlightPrice.route_id == route.id,
                    FlightPrice.departure_date >= month_start,
                    FlightPrice.departure_date <= month_end,
                )
                .group_by(FlightPrice.departure_date)
                .order_by(FlightPrice.departure_date)
            )
            price_rows = price_result.all()

            if price_rows:
                prices = [float(r.min_price) for r in price_rows]
                min_p, max_p = min(prices), max(prices)
                price_range = max_p - min_p if max_p > min_p else 1

                for row in price_rows:
                    today = date.today()
                    weeks = max(0, (row.departure_date - today).days // 7)
                    price_val = float(row.min_price)
                    ratio = (price_val - min_p) / price_range if price_range > 0 else 0.5
                    level = "LOW" if ratio < 0.33 else ("MEDIUM" if ratio < 0.66 else "HIGH")

                    cells.append(HeatmapCell(
                        departure_date=row.departure_date,
                        weeks_before=weeks,
                        predicted_price=Decimal(str(round(price_val))),
                        price_level=level,
                    ))

        return HeatmapResponse(origin=origin, destination=dest, month=month, cells=cells)
