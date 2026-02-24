from fastapi import APIRouter

from app.api.v1 import flights, predictions, recommendations, routes, alerts, auth, health

api_router = APIRouter()

api_router.include_router(health.router, prefix="/v1/health", tags=["health"])
api_router.include_router(auth.router, prefix="/v1/auth", tags=["auth"])
api_router.include_router(flights.router, prefix="/v1/flights", tags=["flights"])
api_router.include_router(predictions.router, prefix="/v1/predictions", tags=["predictions"])
api_router.include_router(
    recommendations.router, prefix="/v1/recommendations", tags=["recommendations"]
)
api_router.include_router(routes.router, prefix="/v1/routes", tags=["routes"])
api_router.include_router(alerts.router, prefix="/v1/alerts", tags=["alerts"])
