# app/core/dependencies.py
# THE SYSTEM HINGE.
#
# JWT (Limbic) → FastAPI (PFC) → DB session context → RLS (Spinothalamic)
#
# This file is the only place where identity crosses into the database.
# Get this right and the rest of the system is structurally correct.

from typing import AsyncGenerator

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import AsyncSessionLocal

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """
    Decode JWT → extract identity.
    Returns the raw payload dict:
        { sub, tenant_id, role, exp }

    This is the Limbic layer: identity and intent, not yet action.
    """
    try:
        payload = decode_access_token(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id   = payload.get("sub")
    tenant_id = payload.get("tenant_id")
    role      = payload.get("role")

    if not all([user_id, tenant_id, role]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload incomplete",
        )

    return {"user_id": user_id, "tenant_id": tenant_id, "role": role}


async def get_db(
    user: dict = Depends(get_current_user),
) -> AsyncGenerator[AsyncSession, None]:
    """
    Open a DB session and IMMEDIATELY inject RLS context from the JWT.

    This is the critical coupling:
        JWT verified ↑
        DB session opened ↓
        SET app.* executed BEFORE any query runs

    Without this, RLS sees empty strings (from the ALTER DATABASE defaults)
    and blocks everything. With it, the database enforces isolation
    for the rest of the request — regardless of what the route handler does.

    The PFC (FastAPI) becomes a thin router. The Spinothalamic tract (RLS)
    does the actual enforcement.
    """
    async with AsyncSessionLocal() as session:
        # Bind identity to the session. Non-negotiable, always first.
        await session.execute(
            text("""
                SET LOCAL app.user_id   = :user_id;
                SET LOCAL app.tenant_id = :tenant_id;
                SET LOCAL app.role      = :role;
            """),
            {
                "user_id":   user["user_id"],
                "tenant_id": user["tenant_id"],
                "role":      user["role"],
            },
        )
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        # SET LOCAL auto-resets at transaction end — no manual RESET needed.
        # This prevents context leaking across pooled connections.
