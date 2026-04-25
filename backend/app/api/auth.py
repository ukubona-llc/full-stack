# app/api/auth.py
# The login boundary — where a password becomes a JWT becomes an identity.

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import verify_password, create_access_token
from app.db.session import AsyncSessionLocal
from app.schemas.schemas import LoginRequest, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])


async def _get_raw_db() -> AsyncSession:
    """
    Login doesn't have a user yet — no JWT to inject.
    This is the only route that bypasses get_db.
    It queries users directly (no RLS on users table by design —
    authentication must work before identity is established).
    """
    async with AsyncSessionLocal() as session:
        yield session


@router.post("/login", response_model=TokenResponse)
async def login(
    credentials: LoginRequest,
    db: AsyncSession = Depends(_get_raw_db),
):
    row = await db.execute(
        text("""
            SELECT u.id, u.tenant_id, u.hashed_password, u.role
            FROM users u
            WHERE u.email = :email
        """),
        {"email": credentials.email},
    )
    user = row.mappings().first()

    if not user or not verify_password(credentials.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    token = create_access_token({
        "sub":       str(user["id"]),
        "tenant_id": str(user["tenant_id"]),
        "role":      user["role"],
    })

    return TokenResponse(
        access_token=token,
        user_id=str(user["id"]),
        tenant_id=str(user["tenant_id"]),
        role=user["role"],
    )
