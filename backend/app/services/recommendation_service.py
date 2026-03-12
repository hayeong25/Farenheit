from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.airline import Airline
from app.models.prediction import Prediction
from app.models.route import Route
from app.schemas.recommendation import RecommendationResponse

_ZERO = Decimal("0")
_PREDICTION_WINDOW_DAYS = 14
_CONFIDENCE_THRESHOLD = Decimal("0.6")


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
                signal="INSUFFICIENT",
                reasoning="이 노선의 데이터가 아직 없습니다. 항공편 검색을 먼저 실행하면 가격 수집이 시작됩니다.",
            )

        # Get latest prediction
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        pred_result = await self.db.execute(
            select(Prediction)
            .where(
                Prediction.route_id == route.id,
                Prediction.departure_date == departure_date,
                Prediction.cabin_class == cabin_class,
                Prediction.valid_until >= now,
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
                signal="INSUFFICIENT",
                reasoning="예측 데이터를 생성 중입니다. 검색으로 가격 수집이 시작된 후 약 1시간 내에 분석이 완료됩니다.",
            )

        # Determine signal based on prediction
        signal = self._determine_signal(pred)

        # Find the date with lowest predicted price (for WAIT signal)
        predicted_low_date, predicted_low_price = await self._find_lowest_price_date_and_price(
            route.id, cabin_class, departure_date
        )

        # Resolve airline code to human-readable name
        best_airline_name: str | None = pred.airline_code
        if pred.airline_code:
            try:
                airline_result = await self.db.execute(
                    select(Airline.name).where(Airline.iata_code == pred.airline_code)
                )
                airline_row = airline_result.scalar_one_or_none()
                if airline_row:
                    best_airline_name = airline_row
            except Exception:
                pass  # Graceful fallback: use airline_code as-is

        return RecommendationResponse(
            origin=origin,
            destination=dest,
            departure_date=departure_date,
            cabin_class=cabin_class,
            signal=signal,
            best_airline=best_airline_name,
            current_price=max(pred.predicted_price, _ZERO) if pred.predicted_price else None,
            predicted_low=max(predicted_low_price, _ZERO) if predicted_low_price else (
                max(pred.confidence_low, _ZERO) if pred.confidence_low else None
            ),
            predicted_low_date=predicted_low_date,
            confidence=pred.confidence_score,
            reasoning=self._generate_reasoning(signal, pred),
        )

    async def _find_lowest_price_date_and_price(
        self, route_id: int, cabin_class: str, departure_date: date
    ) -> tuple[date | None, Decimal | None]:
        """Find the lowest predicted price date within ±14 days of the requested departure."""
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        today = now.date()

        # Search within ±14 days of departure_date for relevant recommendations
        range_start = max(departure_date - timedelta(days=_PREDICTION_WINDOW_DAYS), today)
        range_end = departure_date + timedelta(days=_PREDICTION_WINDOW_DAYS)

        result = await self.db.execute(
            select(Prediction)
            .where(
                Prediction.route_id == route_id,
                Prediction.cabin_class == cabin_class,
                Prediction.departure_date >= range_start,
                Prediction.departure_date <= range_end,
                Prediction.valid_until >= now,
                Prediction.predicted_price.isnot(None),
            )
            .order_by(Prediction.predicted_price.asc())
            .limit(1)
        )
        lowest = result.scalar_one_or_none()
        if lowest:
            return lowest.departure_date, lowest.predicted_price
        return None, None

    def _determine_signal(self, pred: Prediction) -> str:
        has_confidence = pred.confidence_score and pred.confidence_score > _CONFIDENCE_THRESHOLD
        if pred.price_direction == "UP" and has_confidence:
            # Price going up → buy now before it gets more expensive
            return "BUY"
        elif pred.price_direction == "DOWN" and has_confidence:
            # Price going down → wait for lower prices
            return "WAIT"
        elif pred.price_direction == "STABLE" and has_confidence:
            # Stable with high confidence → no reason to wait, buy now
            return "BUY"
        return "HOLD"

    def _generate_reasoning(self, signal: str, pred: Prediction) -> str:
        direction_kr = {"UP": "상승", "DOWN": "하락", "STABLE": "안정"}
        direction = direction_kr.get(pred.price_direction, pred.price_direction)
        try:
            confidence_pct = min(int((pred.confidence_score or _ZERO) * 100), 100)
        except (OverflowError, ValueError):
            confidence_pct = 0

        if signal == "BUY" and pred.price_direction == "STABLE":
            return (
                f"가격이 {direction} 상태입니다 (신뢰도 {confidence_pct}%). "
                f"큰 변동이 없으므로 지금 구매해도 좋습니다."
            )
        elif signal == "BUY":
            return (
                f"가격이 {direction} 추세입니다 (신뢰도 {confidence_pct}%). "
                f"지금 구매하는 것이 유리합니다. 더 기다리면 가격이 오를 가능성이 높습니다."
            )
        elif signal == "WAIT":
            return (
                f"가격이 {direction} 추세입니다 (신뢰도 {confidence_pct}%). "
                f"조금 더 기다리면 더 낮은 가격을 기대할 수 있습니다."
            )
        if pred.price_direction == "DOWN":
            return (
                f"가격이 {direction} 추세이나 신뢰도가 낮습니다 ({confidence_pct}%). "
                f"추가 데이터를 수집 중입니다. 급하지 않다면 모니터링을 계속하세요."
            )
        return (
            f"가격이 {direction} 상태입니다. "
            f"뚜렷한 추세가 없어 추가 데이터를 수집 중입니다. 급하지 않다면 모니터링을 계속하세요."
        )
