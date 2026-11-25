"""Admin-only read proxy for Langfuse generation observations."""
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_current_user
from app.core.config import settings
from app.domain.models import User

router = APIRouter(tags=["Observability"])

_FIELDS = "core,basic,time,io,metadata,model,usage,metrics,trace_context"
_MAX_PAGES = 5
_PAGE_SIZE = 1000


@router.get("/observability/langfuse")
async def langfuse_observations(
    days: int = Query(7, ge=1, le=30),
    user: User = Depends(get_current_user),
):
    """Return recent generation observations for the admin monitoring dashboard."""
    if user.role.lower() != "admin":
        raise HTTPException(status_code=403, detail="Administrator role required")
    if not settings.langfuse_enabled or not settings.langfuse_public_key or not settings.langfuse_secret_key:
        return {
            "configured": False,
            "langfuse_url": settings.langfuse_base_url,
            "days": days,
            "observations": [],
            "truncated": False,
        }

    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    params: dict[str, str | int] = {
        "fromStartTime": start.isoformat(),
        "toStartTime": end.isoformat(),
        "type": "GENERATION",
        "fields": _FIELDS,
        "limit": _PAGE_SIZE,
    }
    observations: list[dict] = []
    cursor: str | None = None
    try:
        async with httpx.AsyncClient(
            base_url=settings.langfuse_base_url.rstrip("/"),
            auth=(settings.langfuse_public_key, settings.langfuse_secret_key),
            timeout=httpx.Timeout(20.0, connect=5.0),
        ) as client:
            for _ in range(_MAX_PAGES):
                if cursor:
                    params["cursor"] = cursor
                response = await client.get("/api/public/v2/observations", params=params)
                if response.status_code == 401:
                    raise HTTPException(status_code=502, detail="Langfuse rejected the configured API keys")
                if response.status_code == 403:
                    raise HTTPException(status_code=502, detail="Langfuse API key needs read access to traces")
                response.raise_for_status()
                payload = response.json()
                observations.extend(payload.get("data", []))
                cursor = (payload.get("meta") or {}).get("cursor")
                if not cursor:
                    break
    except HTTPException:
        raise
    except (httpx.TimeoutException, httpx.ConnectError) as exc:
        raise HTTPException(status_code=502, detail="Could not reach the Langfuse API") from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Langfuse API returned HTTP {exc.response.status_code}") from exc
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="Langfuse returned an invalid observations response") from exc

    return {
        "configured": True,
        "langfuse_url": settings.langfuse_base_url,
        "days": days,
        "observations": observations,
        "truncated": bool(cursor),
    }
