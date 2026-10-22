FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /workspace

COPY apps/worker ./apps/worker
USER nobody
CMD ["python", "apps/worker/app/main.py"]