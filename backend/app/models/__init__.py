from app.models.base import Base
from app.models.airport import Airport
from app.models.airline import Airline
from app.models.route import Route
from app.models.flight_price import FlightPrice
from app.models.prediction import Prediction
from app.models.user import User
from app.models.watchlist import UserWatchlist
from app.models.alert import PriceAlert
from app.models.scrape_job import ScrapeJob

__all__ = [
    "Base",
    "Airport",
    "Airline",
    "Route",
    "FlightPrice",
    "Prediction",
    "User",
    "UserWatchlist",
    "PriceAlert",
    "ScrapeJob",
]
