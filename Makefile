# Makefile — Hybrid Geospatial project commands
# Usage: make <target>

.PHONY: serve test lint format clean check install health help

# ── Setup ─────────────────────────────────────────────────────────────────────

install:                        ## Install all dependencies (base + dev)
	python3 -m pip install -r requirements.txt -r requirements-dev.txt

# ── Run ───────────────────────────────────────────────────────────────────────

serve:                          ## Serve the static UI
	python3 -m http.server 8080

dry-run:                        ## Dry-run all execution scripts
	@scripts=$$(ls execution/*.py 2>/dev/null | grep -v '_template.py'); \
	if [ -z "$$scripts" ]; then \
		echo "No execution scripts found (only _template.py exists)."; \
	else \
		for script in $$scripts; do \
			echo "→ $$script --dry-run"; \
			python3 "$$script" --dry-run; \
		done \
	fi

# ── Quality ───────────────────────────────────────────────────────────────────

test:                           ## Run all tests
	python3 -m pytest tests/ -v --tb=short

test-quiet:                     ## Run tests (minimal output)
	python3 -m pytest tests/ -q

lint:                           ## Lint with ruff
	python3 -m ruff check .

format:                         ## Format with ruff
	python3 -m ruff format .

check: lint test                ## Run lint + tests

# ── Health ────────────────────────────────────────────────────────────────────

health:                         ## Audit project integrity
	python3 scripts/health_check.py

# ── Cleanup ───────────────────────────────────────────────────────────────────

clean:                          ## Remove temp files and caches
	rm -rf .tmp/* __pycache__ .pytest_cache .mypy_cache .ruff_cache
	find . -name "*.pyc" -delete
	find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
	@echo "Cleaned."

# ── Help ─────────────────────────────────────────────────────────────────────

help:                           ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo ""

.DEFAULT_GOAL := help
