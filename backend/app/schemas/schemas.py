# app/schemas/schemas.py
from typing import Any
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    tenant_id: str
    role: str


class RecordCreate(BaseModel):
    label: str
    payload: dict[str, Any] = {}


class RecordOut(BaseModel):
    id: UUID
    tenant_id: UUID
    created_by: UUID
    label: str
    payload: dict[str, Any]
    created_at: datetime

    class Config:
        from_attributes = True


class AuditEntry(BaseModel):
    id: int
    tenant_id: UUID | None
    user_id: UUID | None
    action: str
    table_name: str
    record_id: UUID | None
    created_at: datetime
