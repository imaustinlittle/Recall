import uuid
from typing import Optional

from fastapi import Cookie, Depends, HTTPException, Request, status
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_async_db
from app.config import settings
from app import models

_CREDENTIALS_EXC = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def _extract_token(
    request: Request,
    access_token: Optional[str] = Cookie(None),
) -> str:
    """
    Token resolution order:
      1. httpOnly cookie  (set by the login endpoint — preferred)
      2. Authorization: Bearer <token> header  (for API / curl consumers)
    """
    if access_token:
        return access_token

    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]

    raise _CREDENTIALS_EXC


async def get_current_user(
    token: str = Depends(_extract_token),
    db: AsyncSession = Depends(get_async_db),
) -> models.User:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise _CREDENTIALS_EXC
    except JWTError:
        raise _CREDENTIALS_EXC

    result = await db.execute(
        select(models.User).where(models.User.id == uuid.UUID(user_id))
    )
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise _CREDENTIALS_EXC
    return user


async def get_current_admin(
    user: models.User = Depends(get_current_user),
) -> models.User:
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user
