import uuid
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from starlette.datastructures import Headers

from app.database import get_async_db
from app.config import settings
from app import models

_CREDENTIALS_EXC = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)

# Sentinel stored in hashed_password for users provisioned from proxy headers.
# It is not a valid bcrypt hash, so verify_password() can never match it —
# such accounts can only ever authenticate through the proxy.
PROXY_PASSWORD_SENTINEL = "!proxy-auth-no-local-password"


# ── Local (JWT) auth ─────────────────────────────────────────────────────────

def _extract_token(request: Request) -> str:
    """
    Token resolution order:
      1. httpOnly cookie  (set by the login endpoint — preferred)
      2. Authorization: Bearer <token> header  (for API / curl consumers)
    """
    cookie_token = request.cookies.get("access_token")
    if cookie_token:
        return cookie_token

    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]

    raise _CREDENTIALS_EXC


async def _user_from_jwt(request: Request, db: AsyncSession) -> models.User:
    token = _extract_token(request)
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        user_id: Optional[str] = payload.get("sub")
        if user_id is None:
            raise _CREDENTIALS_EXC
        uid = uuid.UUID(user_id)
    except (jwt.PyJWTError, ValueError):
        raise _CREDENTIALS_EXC

    result = await db.execute(select(models.User).where(models.User.id == uid))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise _CREDENTIALS_EXC
    return user


# ── Proxy (forward-auth header) auth ─────────────────────────────────────────

def _parse_groups(raw: str) -> list[str]:
    sep = settings.proxy_auth_groups_separator
    return [g.strip() for g in raw.split(sep) if g.strip()] if raw else []


def _is_admin_from_groups(groups: list[str]) -> bool:
    """No admin group configured → every proxy user is an admin."""
    group = settings.proxy_auth_admin_group.strip()
    if not group:
        return True
    return group in groups


async def provision_proxy_user(
    email: str,
    display_name: str,
    groups: list[str],
    db: AsyncSession,
) -> models.User:
    """
    Find or create the local user row that mirrors a proxy-authenticated
    identity, keeping display name / admin flag in sync with the IdP on each
    request. Keyed by (lower-cased) email.
    """
    email = email.strip().lower()
    is_admin = _is_admin_from_groups(groups)
    display_name = (display_name or "").strip() or email.split("@")[0]

    result = await db.execute(select(models.User).where(models.User.email == email))
    user = result.scalar_one_or_none()

    if user is None:
        user = models.User(
            email=email,
            hashed_password=PROXY_PASSWORD_SENTINEL,
            display_name=display_name,
            is_admin=is_admin,
            is_active=True,
        )
        db.add(user)
        try:
            await db.commit()
            await db.refresh(user)
        except IntegrityError:
            # Lost a race with a concurrent first request — fetch the winner.
            await db.rollback()
            result = await db.execute(
                select(models.User).where(models.User.email == email)
            )
            user = result.scalar_one()
        return user

    # Keep the mirror in sync with Authentik.
    changed = False
    if display_name and user.display_name != display_name:
        user.display_name = display_name
        changed = True
    if user.is_admin != is_admin:
        user.is_admin = is_admin
        changed = True
    if not user.is_active:
        user.is_active = True
        changed = True
    if changed:
        await db.commit()
        await db.refresh(user)
    return user


async def proxy_user_from_headers(
    headers: Headers,
    db: AsyncSession,
) -> Optional[models.User]:
    """Resolve a user from forward-auth headers, or None if not present."""
    email = headers.get(settings.proxy_auth_email_header)
    if not email:
        return None
    name = headers.get(settings.proxy_auth_name_header) or headers.get(
        settings.proxy_auth_username_header, ""
    )
    groups = _parse_groups(headers.get(settings.proxy_auth_groups_header, ""))
    return await provision_proxy_user(email, name, groups, db)


# ── Unified dependencies ─────────────────────────────────────────────────────

async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_async_db),
) -> models.User:
    if settings.is_proxy_auth:
        user = await proxy_user_from_headers(request.headers, db)
        if user is None or not user.is_active:
            raise _CREDENTIALS_EXC
        return user
    return await _user_from_jwt(request, db)


async def get_current_admin(
    user: models.User = Depends(get_current_user),
) -> models.User:
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user
