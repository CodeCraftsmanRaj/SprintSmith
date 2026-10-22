.PHONY: install test unit integration up up-core down logs smoke compose-check

install:
	uv sync --extra dev

test: unit integration

unit:
	uv run pytest -q

integration:
	docker compose up -d --build api worker db uploads-init
	./scripts/smoke_test.sh

up:
	docker compose up -d --build

up-core:
	docker compose --profile core up -d --build

down:
	docker compose --profile core down

logs:
	docker compose --profile core logs -f --tail=100

smoke:
	./scripts/smoke_test.sh

compose-check:
	docker compose config >/dev/null
	docker compose --profile core config >/dev/null