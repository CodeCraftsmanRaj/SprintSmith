FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /workspace

COPY pyproject.toml README.md ./
COPY apps/api ./apps/api
COPY main.py ./
RUN pip install --no-cache-dir .

USER nobody
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--app-dir", "apps/api", "--host", "0.0.0.0", "--port", "8000"]