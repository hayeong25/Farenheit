# Farenheit

> Fare + Fahrenheit — 온도계처럼 항공 가격 변동을 측정한다

항공권 가격 변동을 예측하고 최적의 구매 시기와 가격을 추천하는 퀀트 스크리너 시스템

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.0 (async) |
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS |
| Database | SQLite (aiosqlite) |
| Scheduler | APScheduler (BackgroundScheduler) |
| ML | Statistical Predictor (EMA + Trend + Volatility) |
| Data Source | Amadeus Flight Offers Search API |
| Auth | JWT (python-jose + passlib/bcrypt) |

## Project Structure

```
farenheit/
├── backend/          # FastAPI application
│   ├── app/
│   │   ├── api/v1/   # API endpoints (flights, predictions, recommendations, alerts, stats, auth)
│   │   ├── models/   # SQLAlchemy ORM models
│   │   ├── schemas/  # Pydantic request/response models
│   │   ├── services/ # Business logic (flight search, recommendations)
│   │   ├── core/     # Security, middleware
│   │   └── db/       # Database session management
│   └── alembic/      # DB migrations
├── pipeline/         # Data collection + ML pipeline
│   ├── collectors/   # Amadeus API collector
│   ├── ml/models/    # Statistical predictor model
│   └── tasks/        # Scheduled tasks (collect, predict, alerts, cleanup)
├── frontend/         # Next.js web application
│   └── src/
│       ├── app/      # Pages (dashboard, search, predictions, recommendations, alerts)
│       ├── components/  # UI components (AirportSearch, layout)
│       └── lib/      # API client, utilities
└── scripts/          # Seed scripts (airports, airlines, routes)
```

## Features

- **Real-time Flight Search**: Amadeus API integration with deduplication, filters (stops, sort)
- **Price Prediction**: Statistical model (EMA + trend + volatility) for 7-60 day forecasts
- **Buy Recommendations**: BUY / WAIT / HOLD signals based on predictions
- **Price Alerts**: Set target prices and get notified when reached
- **Worldwide Airport Data**: 7,800+ IATA airports with Korean city name support
- **Scheduled Pipeline**: Auto price collection (30min), predictions (60min), daily cleanup

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 20+

### Setup

```bash
# 1. Copy environment variables
cp .env.example .env
# Edit .env with your Amadeus API credentials

# 2. Install backend dependencies
cd backend && pip install -e ".[dev]" && cd ..

# 3. Seed database (airports, airlines, routes)
cd scripts && python seed_airports.py && cd ..

# 4. Start backend (port 9000)
cd backend && uvicorn app.main:app --host 0.0.0.0 --port 9000 --reload

# 5. Start frontend (port 3100)
cd frontend && npm install && npm run dev -- -p 3100
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/flights/search` | Real-time flight search |
| GET | `/api/v1/flights/prices/history` | Price history |
| GET | `/api/v1/predictions` | Price predictions |
| GET | `/api/v1/predictions/heatmap` | Price heatmap |
| GET | `/api/v1/recommendations` | Buy recommendations |
| GET | `/api/v1/stats` | System statistics |
| POST | `/api/v1/auth/register` | User registration |
| POST | `/api/v1/auth/login` | User login |
| GET/POST/DELETE | `/api/v1/alerts` | Price alerts (auth required) |

## Data Pipeline

```
APScheduler → collect_prices (30min) → run_prediction (60min) → check_alerts
                                                               → daily cleanup (4 AM)
```

## License

Private
