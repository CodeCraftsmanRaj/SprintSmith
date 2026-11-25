"""
Authentication API endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import get_auth_service, get_current_user
from app.core.exceptions import AccountLockedError, AuthenticationError
from app.domain.models import User
from app.domain.schemas import LoginRequest, Token, UserOut
from app.domain.schemas.auth import PasswordResetTokenRequest
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=Token)
def login(payload: LoginRequest, auth_service: AuthService = Depends(get_auth_service)):
    try:
        access_token = auth_service.login(email=payload.email, password=payload.password)
        return Token(access_token=access_token)
    except AuthenticationError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )
    except AccountLockedError as e:
        raise HTTPException(status_code=423, detail=str(e)) from e


@router.post("/admin/login", response_model=Token)
def admin_login(payload: LoginRequest, auth_service: AuthService = Depends(get_auth_service)):
    try:
        return Token(access_token=auth_service.admin_login(payload.email, payload.password))
    except AccountLockedError as e:
        raise HTTPException(status_code=423, detail=str(e)) from e
    except AuthenticationError as e:
        raise HTTPException(status_code=401, detail=str(e),
                            headers={"WWW-Authenticate": "Bearer"}) from e


@router.post("/password-reset")
def password_reset(payload: PasswordResetTokenRequest,
                   auth_service: AuthService = Depends(get_auth_service)):
    try:
        auth_service.reset_password(payload.token, payload.new_password)
        return {"status": "password_reset"}
    except AuthenticationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
