"""Lightweight statistical prediction model - works without Prophet.

Uses exponential moving average, trend analysis, and volatility estimation
to generate price predictions when ML models can't be used.
"""

import logging
from datetime import date, timedelta
from decimal import Decimal

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


class StatisticalPredictor:
    """Price prediction using statistical methods (EMA, trend, volatility)."""

    def predict(
        self,
        price_history: pd.DataFrame,
        forecast_days: int = 14,
    ) -> dict | None:
        """
        Generate prediction from price history.

        Args:
            price_history: DataFrame with 'time' and 'price_amount' columns
            forecast_days: Days ahead to forecast

        Returns:
            dict with predicted_price, confidence_low, confidence_high,
            price_direction, confidence_score, forecast_series
        """
        if price_history.empty or len(price_history) < 3:
            return None

        df = price_history.copy()
        df["time"] = pd.to_datetime(df["time"])
        df = df.sort_values("time")
        df["price"] = df["price_amount"].astype(float)

        # Daily aggregation (use min price per day = best available price)
        daily = df.groupby(df["time"].dt.date)["price"].agg(["mean", "min", "max"]).reset_index()
        daily.columns = ["date", "avg_price", "min_price", "max_price"]
        daily = daily.sort_values("date")

        prices = daily["avg_price"].values
        n = len(prices)

        # Current price metrics
        current_price = prices[-1]
        min_observed = prices.min()
        max_observed = prices.max()

        # EMA (exponential moving average) - recent prices weighted more
        if n >= 7:
            ema_short = self._ema(prices, span=3)
            ema_long = self._ema(prices, span=7)
        else:
            ema_short = prices.mean()
            ema_long = prices.mean()

        # Trend analysis
        if n >= 3:
            # Linear regression on last available points
            x = np.arange(min(n, 14))
            y = prices[-len(x):]
            slope, intercept = np.polyfit(x, y, 1)
            trend_per_day = slope
        else:
            trend_per_day = 0

        # Volatility (standard deviation of daily changes)
        if n >= 3:
            daily_changes = np.diff(prices) / prices[:-1]
            volatility = np.std(daily_changes) if len(daily_changes) > 0 else 0.05
        else:
            volatility = 0.05  # Default 5% volatility

        # Price direction
        if n >= 5:
            recent_trend = (prices[-1] - prices[-min(5, n)]) / prices[-min(5, n)]
            if recent_trend > 0.02:
                direction = "UP"
            elif recent_trend < -0.02:
                direction = "DOWN"
            else:
                direction = "STABLE"
        else:
            direction = "STABLE"

        # Confidence based on data quantity and consistency
        data_confidence = min(n / 30, 1.0) * 0.5  # More data = more confident
        trend_consistency = 1.0 - min(volatility * 5, 0.5)  # Less volatile = more confident
        confidence = round(data_confidence + trend_consistency * 0.5, 3)
        confidence = max(0.1, min(confidence, 0.95))

        # Generate forecast series
        forecast_series = []
        last_date = daily["date"].iloc[-1]
        for d in range(1, forecast_days + 1):
            forecast_date = last_date + timedelta(days=d)
            predicted = current_price + trend_per_day * d
            # Add seasonality: slight premium for weekends
            if forecast_date.weekday() >= 5:  # Weekend
                predicted *= 1.01

            # Confidence interval widens over time
            uncertainty = current_price * volatility * np.sqrt(d)
            low = max(predicted - uncertainty * 1.5, min_observed * 0.9)
            high = predicted + uncertainty * 1.5

            forecast_series.append({
                "date": forecast_date.isoformat(),
                "predicted_price": round(predicted, 0),
                "confidence_low": round(low, 0),
                "confidence_high": round(high, 0),
            })

        mid_idx = forecast_days // 2
        mid = forecast_series[mid_idx]

        return {
            "predicted_price": Decimal(str(int(mid["predicted_price"]))),
            "confidence_low": Decimal(str(int(mid["confidence_low"]))),
            "confidence_high": Decimal(str(int(mid["confidence_high"]))),
            "price_direction": direction,
            "confidence_score": confidence,
            "forecast_series": forecast_series,
        }

    @staticmethod
    def _ema(data: np.ndarray, span: int) -> float:
        """Calculate exponential moving average."""
        weights = np.exp(np.linspace(-1, 0, min(len(data), span)))
        weights /= weights.sum()
        return np.dot(data[-len(weights):], weights)
