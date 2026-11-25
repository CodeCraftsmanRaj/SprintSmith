"""Administrator-only user account management."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_auth_service, get_current_user, get_db, require_role
from app.core.exceptions import ConflictError, ResourceNotFoundError
from app.domain.models import User
from app.domain.schemas.auth import AdminUserCreate, AdminUserUpdate, UserOut
from app.services.auth_service import AuthService

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db),
               _: User = Depends(require_role("admin"))):
    return list(db.scalars(select(User).order_by(User.created_at.desc())))


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: AdminUserCreate,
                service: AuthService = Depends(get_auth_service),
                admin: User = Depends(require_role("admin"))):
    try:
        return service.create_user(email=str(payload.email), full_name=payload.full_name,
                                   password=payload.password, role=payload.role,
                                   created_by=admin.id)
    except ConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: str, payload: AdminUserUpdate,
                service: AuthService = Depends(get_auth_service),
                admin: User = Depends(require_role("admin"))):
    updates = payload.model_dump(exclude_unset=True)
    if user_id == admin.id and (updates.get("is_active") is False or updates.get("role") == "member"):
        raise HTTPException(status_code=409, detail="You cannot disable or demote your own admin account")
    try:
        return service.update_user(user_id, updates, updated_by=admin.id)
    except ResourceNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/users/{user_id}/password-reset")
def issue_password_reset(user_id: str, service: AuthService = Depends(get_auth_service),
                         admin: User = Depends(require_role("admin"))):
    try:
        token = service.issue_password_reset(user_id, issued_by=admin.id)
    except ResourceNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    # One-time token is returned for delivery through the deployment's approved channel.
    return {"user_id": user_id, "reset_token": token}
