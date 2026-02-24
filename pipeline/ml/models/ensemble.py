"""Ensemble model combining Prophet and GBM predictions."""

import logging
from datetime import date
from decimal import Decimal

import pandas as pd

from pipeline.ml.models.prophet_model import ProphetPriceModel
from pipeline.ml.models.gradient_boost import PriceDirectionClassifier

logger = logging.getLogger(__name__)


class EnsemblePrediction:
    """Combined prediction result."""

    def __init__(
        self,
        predicted_price: Decimal,
        confidence_low: Decimal,
        confidence_high: Decimal,
        price_direction: str,
        confidence_score: float,
        forecast_series: list[dict],
    ):
        self.predicted_price = predicted_price
        self.confidence_low = confidence_low
        self.confidence_high = confidence_high
        self.price_direction = price_direction
        self.confidence_score = confidence_score
        self.forecast_series = forecast_series


class PriceEnsemble:
    """
    Combines Prophet time-series forecast with GBM direction classifier.

    Decision logic:
    - Prophet provides the price trajectory and confidence intervals
    - GBM provides the short-term direction signal and confidence
    - Final signal is weighted combination of both
    """

    def __init__(self) -> None:
        self.prophet = ProphetPriceModel()
        self.gbm = PriceDirectionClassifier()

    def predict(
        self,
        price_history: pd.DataFrame,
        features_df: pd.DataFrame,
        forecast_days: int = 14,
    ) -> EnsemblePrediction | None:
        """
        Generate ensemble prediction.

        Args:
            price_history: Raw price history (time, price_amount columns)
            features_df: Engineered features DataFrame
            forecast_days: Number of days to forecast

        Returns:
            EnsemblePrediction or None if insufficient data
        """
        if price_history.empty or len(price_history) < 7:
            logger.warning("Insufficient data for prediction (need at least 7 data points)")
            return None

        # Prophet forecast
        self.prophet.fit(price_history)
        forecast = self.prophet.predict(periods=forecast_days)

        if forecast is None or forecast.empty:
            return None

        prophet_direction = self.prophet.get_direction(forecast)

        # GBM prediction (short-term)
        gbm_will_drop, gbm_confidence = self.gbm.predict(features_df)
        gbm_direction = "DOWN" if gbm_will_drop else "UP"

        # Ensemble combination
        final_direction = self._combine_directions(
            prophet_direction, gbm_direction, gbm_confidence
        )

        # Use Prophet's forecast values for price predictions
        mid_forecast = forecast.iloc[len(forecast) // 2]
        predicted_price = Decimal(str(round(mid_forecast["yhat"], 2)))
        confidence_low = Decimal(str(round(mid_forecast["yhat_lower"], 2)))
        confidence_high = Decimal(str(round(mid_forecast["yhat_upper"], 2)))

        # Overall confidence (weighted average)
        prophet_confidence = 0.6  # Prophet is generally reliable for trends
        overall_confidence = prophet_confidence * 0.5 + gbm_confidence * 0.5

        # Build forecast series
        forecast_series = [
            {
                "date": row["ds"].date().isoformat(),
                "predicted_price": round(row["yhat"], 2),
                "confidence_low": round(row["yhat_lower"], 2),
                "confidence_high": round(row["yhat_upper"], 2),
            }
            for _, row in forecast.iterrows()
        ]

        return EnsemblePrediction(
            predicted_price=predicted_price,
            confidence_low=confidence_low,
            confidence_high=confidence_high,
            price_direction=final_direction,
            confidence_score=round(overall_confidence, 3),
            forecast_series=forecast_series,
        )

    def _combine_directions(
        self, prophet_dir: str, gbm_dir: str, gbm_confidence: float
    ) -> str:
        """
        Combine Prophet and GBM direction signals.

        Rules:
        - If both agree, use that direction
        - If they disagree, use GBM if confidence > 0.75, else use Prophet
        - Default to STABLE if unclear
        """
        if prophet_dir == gbm_dir:
            return prophet_dir

        if gbm_confidence > 0.75:
            return gbm_dir

        return prophet_dir
