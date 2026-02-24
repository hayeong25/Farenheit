"""Training orchestrator for ML models."""

import logging
from pathlib import Path

import pandas as pd

from pipeline.ml.features import engineer_features, FEATURE_COLUMNS
from pipeline.ml.models.gradient_boost import PriceDirectionClassifier

logger = logging.getLogger(__name__)

ARTIFACTS_DIR = Path(__file__).parent.parent / "artifacts"


def train_gbm_model(
    price_history: pd.DataFrame,
    departure_date_str: str,
    route_label: str,
) -> dict:
    """
    Train GBM model on historical price data.

    Args:
        price_history: DataFrame with time, price_amount, airline_code columns
        departure_date_str: Target departure date (YYYY-MM-DD)
        route_label: Label for the route (e.g., "ICN-LAX")

    Returns:
        Training metrics
    """
    from datetime import date

    departure_date = date.fromisoformat(departure_date_str)

    # Engineer features
    features_df = engineer_features(price_history, departure_date)

    if features_df.empty or len(features_df) < 30:
        logger.warning(f"Insufficient data for training ({len(features_df)} rows)")
        return {"status": "skipped", "reason": "insufficient_data"}

    # Create labels: did price drop in the next 48 hours?
    features_df["future_price"] = features_df["price_amount"].shift(-2)
    features_df["price_dropped"] = (
        features_df["future_price"] < features_df["price_amount"]
    ).astype(int)
    features_df = features_df.dropna(subset=["future_price"])

    if len(features_df) < 30:
        return {"status": "skipped", "reason": "insufficient_labeled_data"}

    # Train
    classifier = PriceDirectionClassifier()
    metrics = classifier.fit(
        features_df[FEATURE_COLUMNS],
        features_df["price_dropped"],
    )

    # Save model
    model_path = ARTIFACTS_DIR / f"gbm_{route_label}.joblib"
    classifier.save(model_path)

    return {"status": "trained", "metrics": metrics, "model_path": str(model_path)}
