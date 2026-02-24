"""Prophet time-series forecasting model for flight prices."""

import logging
from datetime import date
from decimal import Decimal

import pandas as pd

logger = logging.getLogger(__name__)


class ProphetPriceModel:
    """Time-series forecast using Facebook Prophet."""

    def __init__(self) -> None:
        self.model = None

    def fit(self, price_history: pd.DataFrame) -> None:
        """
        Fit Prophet on historical daily average prices.

        Expected columns: time (datetime), price_amount (float)
        """
        try:
            from prophet import Prophet
        except ImportError:
            logger.error("Prophet not installed. Run: pip install prophet")
            return

        df = price_history.copy()
        df = df.rename(columns={"time": "ds", "price_amount": "y"})
        df["ds"] = pd.to_datetime(df["ds"])
        df = df[["ds", "y"]].dropna()

        # Daily aggregation
        df = df.groupby("ds")["y"].mean().reset_index()

        self.model = Prophet(
            yearly_seasonality=True,
            weekly_seasonality=True,
            daily_seasonality=False,
            changepoint_prior_scale=0.1,
        )
        self.model.fit(df)

    def predict(self, periods: int = 30) -> pd.DataFrame | None:
        """
        Generate forecast for next N days.

        Returns DataFrame with columns: ds, yhat, yhat_lower, yhat_upper
        """
        if self.model is None:
            return None

        future = self.model.make_future_dataframe(periods=periods)
        forecast = self.model.predict(future)
        return forecast[["ds", "yhat", "yhat_lower", "yhat_upper"]].tail(periods)

    def get_direction(self, forecast: pd.DataFrame) -> str:
        """Determine overall price direction from forecast."""
        if forecast is None or forecast.empty:
            return "STABLE"

        first_price = forecast.iloc[0]["yhat"]
        last_price = forecast.iloc[-1]["yhat"]
        change_pct = (last_price - first_price) / first_price

        if change_pct > 0.02:
            return "UP"
        elif change_pct < -0.02:
            return "DOWN"
        return "STABLE"
