"""Prediction service that loads models and returns forecasts."""

import logging
from datetime import date
from pathlib import Path

import pandas as pd

from pipeline.ml.features import engineer_features
from pipeline.ml.models.ensemble import PriceEnsemble, EnsemblePrediction
from pipeline.ml.models.gradient_boost import PriceDirectionClassifier

logger = logging.getLogger(__name__)

ARTIFACTS_DIR = Path(__file__).parent.parent / "artifacts"


class PricePredictor:
    """Loads trained models and generates predictions."""

    def __init__(self) -> None:
        self._model_cache: dict[str, PriceDirectionClassifier] = {}

    def _load_gbm(self, route_label: str) -> PriceDirectionClassifier | None:
        if route_label in self._model_cache:
            return self._model_cache[route_label]

        model_path = ARTIFACTS_DIR / f"gbm_{route_label}.joblib"
        if not model_path.exists():
            logger.warning(f"No trained model found for {route_label}")
            return None

        classifier = PriceDirectionClassifier()
        classifier.load(model_path)
        self._model_cache[route_label] = classifier
        return classifier

    def predict(
        self,
        price_history: pd.DataFrame,
        route_label: str,
        departure_date: date,
        forecast_days: int = 14,
    ) -> EnsemblePrediction | None:
        """
        Generate price prediction for a route.

        Args:
            price_history: Historical prices (time, price_amount columns)
            route_label: Route identifier (e.g., "ICN-LAX")
            departure_date: Target departure date
            forecast_days: Number of days to forecast

        Returns:
            EnsemblePrediction or None
        """
        features_df = engineer_features(price_history, departure_date)
        ensemble = PriceEnsemble()

        # Load pre-trained GBM if available
        gbm = self._load_gbm(route_label)
        if gbm:
            ensemble.gbm = gbm

        return ensemble.predict(price_history, features_df, forecast_days)
