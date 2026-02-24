from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prediction import Prediction
from app.models.route import Route
from app.schemas.recommendation import RecommendationResponse


class RecommendationService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_recommendation(
        self, origin: str, dest: str, departure_date: date, cabin_class: str
    ) -> RecommendationResponse:
        route_result = await self.db.execute(
            select(Route).where(Route.origin_code == origin, Route.dest_code == dest)
        )
        route = route_result.scalar_one_or_none()

        if not route:
            return RecommendationResponse(
                origin=origin,
                destination=dest,
                departure_date=departure_date,
                cabin_class=cabin_class,
                signal="HOLD",
                reasoning="No data available for this route yet. We are collecting price data.",
            )

        # Get latest prediction
        pred_result = await self.db.execute(
            select(Prediction)
            .where(
                Prediction.route_id == route.id,
                Prediction.departure_date == departure_date,
                Prediction.cabin_class == cabin_class,
            )
            .order_by(Prediction.predicted_at.desc())
            .limit(1)
        )
        pred = pred_result.scalar_one_or_none()

        if not pred:
            return RecommendationResponse(
                origin=origin,
                destination=dest,
                departure_date=departure_date,
                cabin_class=cabin_class,
                signal="HOLD",
                reasoning="Prediction data is being generated. Please check back later.",
            )

        # Determine signal based on prediction
        signal = self._determine_signal(pred)

        return RecommendationResponse(
            origin=origin,
            destination=dest,
            departure_date=departure_date,
            cabin_class=cabin_class,
            signal=signal,
            best_airline=pred.airline_code,
            current_price=pred.predicted_price,
            predicted_low=pred.confidence_low,
            confidence=pred.confidence_score,
            reasoning=self._generate_reasoning(signal, pred),
        )

    def _determine_signal(self, pred: Prediction) -> str:
        has_confidence = pred.confidence_score and pred.confidence_score > Decimal("0.6")
        if pred.price_direction == "UP" and has_confidence:
            # Price going up → buy now before it gets more expensive
            return "BUY"
        elif pred.price_direction == "DOWN" and has_confidence:
            # Price going down → wait for lower prices
            return "WAIT"
        return "HOLD"

    def _generate_reasoning(self, signal: str, pred: Prediction) -> str:
        direction_kr = {"UP": "상승", "DOWN": "하락", "STABLE": "안정"}
        direction = direction_kr.get(pred.price_direction, pred.price_direction)
        confidence_pct = int(float(pred.confidence_score or 0) * 100)

        if signal == "BUY":
            return (
                f"가격이 {direction} 추세입니다 (신뢰도 {confidence_pct}%). "
                f"지금 구매하는 것이 유리합니다. 더 기다리면 가격이 오를 가능성이 높습니다."
            )
        elif signal == "WAIT":
            return (
                f"가격이 {direction} 추세입니다 (신뢰도 {confidence_pct}%). "
                f"조금 더 기다리면 더 낮은 가격을 기대할 수 있습니다."
            )
        return (
            f"가격이 {direction} 상태입니다. "
            f"뚜렷한 추세가 없어 추가 데이터를 수집 중입니다. 급하지 않다면 모니터링을 계속하세요."
        )
