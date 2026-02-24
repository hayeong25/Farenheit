"""Lightweight statistical prediction model - works without Prophet.

Uses exponential moving average, trend analysis, volatility estimation,
and day-of-week seasonality to generate price predictions.
"""

import logging
from datetime import date, timedelta
from decimal import Decimal

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


class StatisticalPredictor:
    """Price prediction using statistical methods (EMA, trend, volatility, seasonality)."""

    # Day-of-week seasonality factors (Mon=0 ... Sun=6)
    # Based on typical flight pricing: weekdays slightly cheaper, weekend departures pricier
    DOW_FACTORS = {
        0: 0.98,   # Monday - slightly below avg
        1: 0.97,   # Tuesday - cheapest day
        2: 0.98,   # Wednesday - slightly below avg
        3: 1.00,   # Thursday - average
        4: 1.03,   # Friday - slightly above avg
        5: 1.04,   # Saturday - above avg
        6: 1.02,   # Sunday - slightly above avg
    }

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
            ema_long = self._ema(prices, span=min(n, 14))
        else:
            ema_short = prices.mean()
            ema_long = prices.mean()

        # Trend analysis - use all available data (up to 30 days)
        trend_window = min(n, 30)
        if trend_window >= 3:
            x = np.arange(trend_window)
            y = prices[-trend_window:]
            slope, intercept = np.polyfit(x, y, 1)
            trend_per_day = slope
        else:
            trend_per_day = 0

        # Volatility (standard deviation of daily changes)
        if n >= 3:
            prev_prices = prices[:-1]
            safe_mask = prev_prices > 0.01
            if safe_mask.any():
                safe_changes = np.diff(prices)[safe_mask] / prev_prices[safe_mask]
                volatility = float(np.std(safe_changes)) if len(safe_changes) > 1 else 0.05
            else:
                volatility = 0.05
        else:
            volatility = 0.05

        # Clamp volatility to reasonable range
        volatility = max(0.01, min(volatility, 0.3))

        # Price direction - use longer window for stability
        direction_window = min(n, 10)
        if direction_window >= 3:
            recent_prices = prices[-direction_window:]
            weights = np.linspace(0.5, 1.0, len(recent_prices))
            weighted_trend = np.polyfit(np.arange(len(recent_prices)), recent_prices, 1, w=weights)
            pct_change = weighted_trend[0] * len(recent_prices) / recent_prices.mean()

            if pct_change > 0.015:
                direction = "UP"
            elif pct_change < -0.015:
                direction = "DOWN"
            else:
                direction = "STABLE"
        else:
            direction = "STABLE"

        # Confidence based on data quantity, consistency, and trend strength
        data_confidence = min(n / 20, 1.0) * 0.4  # Full confidence at 20 data points
        trend_consistency = max(0, 1.0 - volatility * 3) * 0.3
        trend_strength = min(abs(trend_per_day / (current_price + 1)) * 100, 1.0) * 0.3
        confidence = round(data_confidence + trend_consistency + trend_strength, 3)
        confidence = float(np.clip(confidence, 0.1, 0.95))

        # Generate forecast series with EMA-weighted prediction + seasonality
        forecast_series = []
        last_date = daily["date"].iloc[-1]
        ema_weight = 0.6
        trend_weight = 0.4

        for d in range(1, forecast_days + 1):
            forecast_date = last_date + timedelta(days=d)

            # EMA-based: mean reversion toward EMA
            ema_predicted = ema_short + (ema_long - ema_short) * (d / forecast_days) * 0.3
            # Trend-based: linear extrapolation with dampening
            dampening = 1.0 / (1.0 + d * 0.05)
            trend_predicted = current_price + trend_per_day * d * dampening

            predicted = ema_weight * ema_predicted + trend_weight * trend_predicted

            # Apply day-of-week seasonality
            dow = forecast_date.weekday()
            predicted *= self.DOW_FACTORS.get(dow, 1.0)

            # Confidence interval widens over time
            uncertainty = current_price * volatility * np.sqrt(d) * 1.2
            low = max(predicted - uncertainty, min_observed * 0.85)
            high = predicted + uncertainty

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
        return float(np.dot(data[-len(weights):], weights))
