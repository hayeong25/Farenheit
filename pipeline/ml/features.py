"""Feature engineering for flight price prediction."""

from datetime import date, datetime

import pandas as pd


def engineer_features(price_df: pd.DataFrame, departure_date: date) -> pd.DataFrame:
    """
    Engineer features from raw price history DataFrame.

    Expected columns: time, price_amount, airline_code, departure_date
    """
    df = price_df.copy()

    if df.empty:
        return df

    # Days until departure
    df["days_until_departure"] = (
        pd.to_datetime(departure_date) - pd.to_datetime(df["time"])
    ).dt.days

    # Day of week features
    df["day_of_week"] = pd.to_datetime(df["time"]).dt.dayofweek
    df["is_weekend"] = df["day_of_week"].isin([5, 6]).astype(int)

    # Departure day features
    dep_date = pd.to_datetime(departure_date)
    df["departure_day_of_week"] = dep_date.dayofweek
    df["departure_month"] = dep_date.month
    df["is_holiday_season"] = dep_date.month in [6, 7, 8, 12]

    # Rolling price statistics
    df = df.sort_values("time")
    df["price_rolling_7d_mean"] = (
        df["price_amount"].rolling(window=7, min_periods=1).mean()
    )
    df["price_rolling_7d_std"] = (
        df["price_amount"].rolling(window=7, min_periods=1).std().fillna(0)
    )
    df["price_rolling_14d_mean"] = (
        df["price_amount"].rolling(window=14, min_periods=1).mean()
    )
    df["price_rolling_30d_mean"] = (
        df["price_amount"].rolling(window=30, min_periods=1).mean()
    )

    # Price velocity (rate of change)
    df["price_change_1d"] = df["price_amount"].diff(1).fillna(0)
    df["price_change_7d"] = df["price_amount"].diff(7).fillna(0)
    df["price_pct_change"] = df["price_amount"].pct_change().fillna(0)

    # Price relative to min/max
    min_price = df["price_amount"].min()
    max_price = df["price_amount"].max()
    price_range = max_price - min_price
    if price_range > 0:
        df["price_position"] = (df["price_amount"] - min_price) / price_range
    else:
        df["price_position"] = 0.5

    return df


FEATURE_COLUMNS = [
    "days_until_departure",
    "day_of_week",
    "is_weekend",
    "departure_day_of_week",
    "departure_month",
    "is_holiday_season",
    "price_rolling_7d_mean",
    "price_rolling_7d_std",
    "price_rolling_14d_mean",
    "price_rolling_30d_mean",
    "price_change_1d",
    "price_change_7d",
    "price_pct_change",
    "price_position",
]
