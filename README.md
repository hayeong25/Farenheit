# Farenheit

> Fare + Fahrenheit — 온도계처럼 항공 가격 변동을 측정한다

항공권 가격 변동을 예측하고 최적의 구매 시기와 가격을 추천하는 퀀트 스크리너 시스템

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python, FastAPI |
| Frontend | Next.js, TypeScript, Tailwind CSS, shadcn/ui |
| Database | PostgreSQL + TimescaleDB |
| Pipeline | Celery, Redis |
| ML | Prophet, scikit-learn |
| Data Source | Amadeus API |

## Project Structure

```
farenheit/
├── backend/     # FastAPI application
├── pipeline/    # Data collection + ML pipeline
├── frontend/    # Next.js web application
├── infra/       # Docker, Nginx, deployment configs
└── scripts/     # Utility scripts
```

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 20+
- Docker & Docker Compose

### Development

```bash
# 1. Copy environment variables
cp .env.example .env

# 2. Start all services
make dev

# 3. Run backend only
make backend

# 4. Run frontend only
make frontend
```

## License

Private
