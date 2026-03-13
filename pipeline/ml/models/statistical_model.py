"""Lightweight statistical prediction model - works without Prophet.

Uses exponential moving average, trend analysis, volatility estimation,
and day-of-week seasonality to generate price predictions.
"""

import logging
from datetime import timedelta
from decimal import Decimal

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# Model hyperparameters
EMA_SHORT_SPAN = 3
EMA_LONG_SPAN = 14
MAX_TREND_WINDOW = 30
MIN_VOLATILITY = 0.01
MAX_VOLATILITY = 0.30
PRICE_DIRECTION_THRESHOLD = 0.015
TREND_DAMPENING_FACTOR = 0.05
UNCERTAINTY_SCALING = 1.2
MIN_PRICE_FLOOR_RATIO = 0.85


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
        if forecast_days < 1:
            forecast_days = 14

        df = price_history.copy()
        df["time"] = pd.to_datetime(df["time"])
        df = df.sort_values("time")
        df["price"] = df["price_amount"].astype(float)

        # Daily aggregation (use min price per day = best available price)
        daily = df.groupby(df["time"].dt.date)["price"].agg(["mean", "min", "max"]).reset_index()
        daily.columns = ["date", "avg_price", "min_price", "max_price"]
        daily = daily.sort_values("date")
        daily = daily.dropna(subset=["avg_price"])
        if daily.empty:
            return None

        prices = daily["avg_price"].values
        n = len(prices)

        # Current price metrics
        current_price = prices[-1]
        if not np.isfinite(current_price) or current_price <= 0:
            # NaN/Inf/Zero/negative price = corrupted data, fall back to mean
            finite_prices = prices[np.isfinite(prices)]
            current_price = max(float(finite_prices.mean()), 1.0) if len(finite_prices) > 0 else 1.0
        min_observed = max(float(np.nanmin(prices)), 0)
        max_observed = float(np.nanmax(prices))

        # EMA (exponential moving average) - recent prices weighted more
        if n >= 7:
            ema_short = self._ema(prices, span=EMA_SHORT_SPAN)
            ema_long = self._ema(prices, span=min(n, EMA_LONG_SPAN))
        else:
            ema_short = float(np.nanmean(prices))
            ema_long = float(np.nanmean(prices))
        # NaN safety for EMA values
        if not np.isfinite(ema_short):
            ema_short = current_price
        if not np.isfinite(ema_long):
            ema_long = current_price

        # Trend analysis - use all available data (up to 30 days)
        trend_window = min(n, MAX_TREND_WINDOW)
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
                safe_changes = safe_changes[np.isfinite(safe_changes)]
                volatility = float(np.std(safe_changes)) if len(safe_changes) > 1 else 0.05
            else:
                volatility = 0.05
        else:
            volatility = 0.05

        # Clamp volatility to reasonable range
        volatility = max(MIN_VOLATILITY, min(volatility, MAX_VOLATILITY))

        # Price direction - use longer window for stability
        direction_window = min(n, 10)
        if direction_window >= 3:
            recent_prices = prices[-direction_window:]
            weights = np.linspace(0.5, 1.0, len(recent_prices))
            weighted_trend = np.polyfit(np.arange(len(recent_prices)), recent_prices, 1, w=weights)
            mean_price = recent_prices.mean()
            pct_change = weighted_trend[0] * len(recent_prices) / max(mean_price, 1.0)

            if pct_change > PRICE_DIRECTION_THRESHOLD:
                direction = "UP"
            elif pct_change < -PRICE_DIRECTION_THRESHOLD:
                direction = "DOWN"
            else:
                direction = "STABLE"
        else:
            direction = "STABLE"

        # Confidence based on data quantity, consistency, and trend strength
        data_confidence = min(n / 20, 1.0) * 0.4  # Full confidence at 20 data points
        trend_consistency = max(0, 1.0 - volatility * 3) * 0.3
        trend_strength = min(abs(trend_per_day / max(current_price, 1.0)) * 100, 1.0) * 0.3
        confidence = round(data_confidence + trend_consistency + trend_strength, 3)
        confidence = float(np.clip(confidence, 0.1, 0.95)) if np.isfinite(confidence) else 0.1

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
            dampening = 1.0 / (1.0 + d * TREND_DAMPENING_FACTOR)
            trend_predicted = current_price + trend_per_day * d * dampening

            predicted = ema_weight * ema_predicted + trend_weight * trend_predicted

            # Apply day-of-week seasonality
            dow = forecast_date.weekday()
            predicted *= self.DOW_FACTORS.get(dow, 1.0)

            # Confidence interval widens over time
            uncertainty = current_price * volatility * np.sqrt(d) * UNCERTAINTY_SCALING
            low = max(predicted - uncertainty, min_observed * MIN_PRICE_FLOOR_RATIO)
            high = predicted + uncertainty

            # NaN/Inf safety: clamp to 0 if not finite
            predicted = predicted if np.isfinite(predicted) else current_price
            low = low if np.isfinite(low) else 0
            high = high if np.isfinite(high) else predicted * 1.2

            forecast_series.append({
                "date": forecast_date.isoformat(),
                "predicted_price": round(max(predicted, 0), 0),
                "confidence_low": round(max(low, 0), 0),
                "confidence_high": round(max(high, 0), 0),
            })

        # Use the final forecast day (closest to departure date)
        mid = forecast_series[-1]

        return {
            "predicted_price": Decimal(str(max(int(mid["predicted_price"]), 0))),
            "confidence_low": Decimal(str(max(int(mid["confidence_low"]), 0))),
            "confidence_high": Decimal(str(max(int(mid["confidence_high"]), 0))),
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
