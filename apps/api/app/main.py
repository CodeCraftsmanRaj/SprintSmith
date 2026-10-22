import json
import logging
import time
from collections.abc import Iterator
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from starlette.responses import Response

from app.config import get_settings
from app.contracts import HealthResponse, SearchRequest, SearchResponse

logger = logging.getLogger("sprintsmith.api")
HTTP_REQUESTS = Counter(
    "sprintsmith_http_requests_total",
    "Total HTTP requests handled by the API.",
    ["method", "path", "status"],
)
HTTP_LATENCY = Histogram(
    "sprintsmith_http_request_duration_seconds",
    "HTTP request duration in seconds.",
    ["method", "path"],
)


@asynccontextmanager
async def lifespan(_: FastAPI) -> Iterator[None]:
    settings = get_settings()
    logging.basicConfig(level=settings.log_level, format="%(message)s")
    logger.info(json.dumps({"event": "service_started", "environment": settings.environment}))
    yield
    logger.info(json.dumps({"event": "service_stopped"}))


app = FastAPI(title="SprintSmith API", version=get_settings().version, lifespan=lifespan)


@app.middleware("http")
async def request_logging(request: Request, call_next):
    request_id = request.headers.get("x-request-id", str(uuid4()))
    started = time.perf_counter()
    response = await call_next(request)
    duration_seconds = time.perf_counter() - started
    duration_ms = round(duration_seconds * 1_000, 2)
    HTTP_REQUESTS.labels(request.method, request.url.path, str(response.status_code)).inc()
    HTTP_LATENCY.labels(request.method, request.url.path).observe(duration_seconds)
    response.headers["x-request-id"] = request_id
    logger.info(
        json.dumps(
            {
                "event": "http_request",
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
            }
        )
    )
    return response


@app.get("/metrics", include_in_schema=False)
async def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(status="ok", service=settings.app_name, version=settings.version)


@app.get("/ready", response_model=HealthResponse)
async def ready() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(status="ready", service=settings.app_name, version=settings.version)


@app.post("/v1/search", response_model=SearchResponse)
async def search(request: SearchRequest) -> SearchResponse:
    return SearchResponse(query=request.query, mode="hybrid", results=[])


def run() -> None:
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=False)