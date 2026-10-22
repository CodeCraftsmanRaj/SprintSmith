FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /workspace

COPY pyproject.toml README.md ./
COPY apps/worker ./apps/worker
RUN pip install --no-cache-dir "psycopg[binary]>=3.2,<4.0" "python-docx>=1.1,<2.0"

USER nobody
CMD ["python", "apps/worker/app/main.py"]