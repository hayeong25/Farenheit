from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prediction import Prediction
from app.schemas.prediction import PredictionResponse, HeatmapResponse


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
                predicted_price=0,
                confidence_low=None,
                confidence_high=None,
                price_direction="STABLE",
                confidence_score=None,
                model_version="none",
                predicted_at=departure_date,
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
        self, origin: str, dest: str, month: str
    ) -> HeatmapResponse:
        # TODO: Implement heatmap generation from predictions
        return HeatmapResponse(
            origin=origin,
            destination=dest,
            month=month,
            cells=[],
        )
