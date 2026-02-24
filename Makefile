.PHONY: dev backend frontend install seed test lint clean

# Install all dependencies
install:
	cd backend && pip install -e ".[dev]"
	cd frontend && npm install

# Seed database with reference data
seed:
	python scripts/seed_airports.py

# Run backend (includes APScheduler)
backend:
	cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Run frontend
frontend:
	cd frontend && npm run dev

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

# Cleanup
clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null; true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null; true
	find . -type d -name .mypy_cache -exec rm -rf {} + 2>/dev/null; true
	rm -f data/farenheit.db
