"""Gradient Boosting classifier for price direction prediction."""

import logging
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import cross_val_score

from pipeline.ml.features import FEATURE_COLUMNS

logger = logging.getLogger(__name__)


class PriceDirectionClassifier:
    """Predicts whether price will drop in the next 48 hours."""

    def __init__(self) -> None:
        self.model = GradientBoostingClassifier(
            n_estimators=200,
            max_depth=5,
            learning_rate=0.1,
            subsample=0.8,
            random_state=42,
        )
        self.is_fitted = False

    def fit(self, features_df: pd.DataFrame, labels: pd.Series) -> dict:
        """
        Train the classifier.

        Args:
            features_df: DataFrame with FEATURE_COLUMNS
            labels: Binary series (1 = price dropped, 0 = price stayed or rose)

        Returns:
            Training metrics dict
        """
        X = features_df[FEATURE_COLUMNS].fillna(0)
        y = labels

        # Cross-validation
        cv_scores = cross_val_score(self.model, X, y, cv=5, scoring="accuracy")

        # Final fit on all data
        self.model.fit(X, y)
        self.is_fitted = True

        metrics = {
            "cv_accuracy_mean": float(np.mean(cv_scores)),
            "cv_accuracy_std": float(np.std(cv_scores)),
            "feature_importances": dict(
                zip(FEATURE_COLUMNS, self.model.feature_importances_.tolist())
            ),
        }
        logger.info(f"GBM trained: accuracy={metrics['cv_accuracy_mean']:.3f}")
        return metrics

    def predict(self, features_df: pd.DataFrame) -> tuple[bool, float]:
        """
        Predict if price will drop.

        Returns:
            Tuple of (will_drop: bool, confidence: float)
        """
        if not self.is_fitted:
            return False, 0.0

        X = features_df[FEATURE_COLUMNS].fillna(0).tail(1)
        proba = self.model.predict_proba(X)[0]
        will_drop = bool(self.model.predict(X)[0])
        confidence = float(max(proba))

        return will_drop, confidence

    def save(self, path: Path) -> None:
        import joblib

        joblib.dump(self.model, path)
        logger.info(f"Model saved to {path}")

    def load(self, path: Path) -> None:
        import joblib

        self.model = joblib.load(path)
        self.is_fitted = True
        logger.info(f"Model loaded from {path}")
