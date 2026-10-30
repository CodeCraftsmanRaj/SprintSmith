#!/usr/bin/env python3
"""Prepare /opt/sprintsmith/.env on the VM before `docker compose up`.

Idempotent: it only adds or fills in values that are missing or still contain
placeholders. Application secrets are never printed.
"""
import json
import secrets
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import quote

env_file = Path("/opt/sprintsmith/.env")
compose_file = Path("/opt/sprintsmith/infra/deploy/compose.production.yaml")
PLACEHOLDER_MARKERS = ("replace-with", "change_me", "your_")

lines = env_file.read_text().splitlines()
values = {
    line.split("=", 1)[0]: line.split("=", 1)[1]
    for line in lines
    if "=" in line and not line.lstrip().startswith("#")
}
keys = {line.split("=", 1)[0] for line in lines if "=" in line}


def write_env() -> None:
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=env_file.parent, delete=False
    ) as temporary:
        temporary.write("\n".join(lines) + "\n")
        temporary_path = Path(temporary.name)
    temporary_path.chmod(0o600)
    temporary_path.replace(env_file)


def is_placeholder(value: str) -> bool:
    lowered = value.lower()
    return any(marker in lowered for marker in PLACEHOLDER_MARKERS)


changed = False

# Grafana needs an admin password before `docker compose config` can run, so
# handle it first. Never print the value: read it back from /opt/sprintsmith/.env.
grafana_password = values.get("GRAFANA_ADMIN_PASSWORD", "").strip()
if "GRAFANA_ADMIN_PASSWORD" not in keys:
    lines.append(f"GRAFANA_ADMIN_PASSWORD={secrets.token_urlsafe(24)}")
    print("Generated GRAFANA_ADMIN_PASSWORD in /opt/sprintsmith/.env.")
    changed = True
elif not grafana_password or is_placeholder(grafana_password):
    raise SystemExit(
        "GRAFANA_ADMIN_PASSWORD in /opt/sprintsmith/.env is empty or a placeholder. "
        "Set it to a strong secret before deploying."
    )
else:
    print("Grafana admin password is already configured.")

if changed:
    write_env()
    values = {
        line.split("=", 1)[0]: line.split("=", 1)[1]
        for line in lines
        if "=" in line and not line.lstrip().startswith("#")
    }
    keys = {line.split("=", 1)[0] for line in lines if "=" in line}
    changed = False

needs_database_urls = any(
    not values.get(key, "").strip() or is_placeholder(values[key])
    for key in ("BACKEND_DATABASE_URL", "AI_DATABASE_URL")
)

if needs_database_urls:
    compose = subprocess.run(
        [
            "docker",
            "compose",
            "--env-file",
            str(env_file),
            "-f",
            str(compose_file),
            "config",
            "--format",
            "json",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    database = json.loads(compose.stdout)["services"]["db"]["environment"]
    user = str(database["POSTGRES_USER"])
    password = str(database["POSTGRES_PASSWORD"])
    name = str(database["POSTGRES_DB"])
    if not all((user, password, name)) or any(
        is_placeholder(value) for value in (user, password, name)
    ):
        raise SystemExit(
            "Cannot derive database URLs: PostgreSQL settings are incomplete."
        )

    url = (
        f"postgresql+psycopg://{quote(user, safe='')}:{quote(password, safe='')}"
        f"@db:5432/{quote(name, safe='')}"
    )
    updates = {
        "BACKEND_DATABASE_URL": url,
        "AI_DATABASE_URL": url,
    }
    if not set(updates).issubset(keys):
        raise SystemExit(
            "Cannot derive database URLs: required .env entries are missing."
        )

    lines = [
        f"{key}='{updates[key]}'" if (key := line.split("=", 1)[0]) in updates else line
        for line in lines
    ]
    print("Generated database URLs from the existing PostgreSQL settings.")
    changed = True

if changed:
    write_env()
else:
    print("Database URLs are already configured.")
