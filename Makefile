.PHONY: dev backend frontend worker scheduler test lint clean

# Development
dev:
	docker compose -f infra/docker-compose.yml up --build

dev-down:
	docker compose -f infra/docker-compose.yml down

# Backend
backend:
	cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend
frontend:
	cd frontend && npm run dev

# Pipeline
worker:
	cd pipeline && celery -A celery_app worker --loglevel=info --concurrency=4

scheduler:
	cd pipeline && celery -A celery_app beat --loglevel=info

# Testing
test-backend:
	cd backend && pytest tests/ -v

test-frontend:
	cd frontend && npm test

test: test-backend test-frontend

# Linting
lint-backend:
	cd backend && ruff check . && mypy .

lint-frontend:
	cd frontend && npm run lint

lint: lint-backend lint-frontend

# Database
db-migrate:
	cd backend && alembic upgrade head

db-revision:
	cd backend && alembic revision --autogenerate -m "$(msg)"

# Cleanup
clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null; true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null; true
	find . -type d -name .mypy_cache -exec rm -rf {} + 2>/dev/null; true
