# app/core/security.py
# People (Agency) → JWT  {Limbic}
# Identity is minted here. Every downstream decision traces back to this.

from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

SECRET_KEY = "CHANGE-THIS-IN-PRODUCTION-USE-ENV-VAR"
ALGORITHM  = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def create_access_token(data: dict[str, Any]) -> str:
    """
    Mint a JWT.
    Payload encodes identity (sub), tenant boundary (tenant_id),
    and role (the scope of agency within the tenant).
    These three fields drive the RLS context injection downstream.
    """
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """
    Decode and verify. Raises JWTError if invalid or expired.
    Callers wrap this in an HTTPException.
    """
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
