# app/api/records.py
# Services (Engine) → FastAPI  {PFC}
#
# Notice what's NOT here: no WHERE tenant_id = ... filters.
# No manual permission checks. No user_id comparisons.
#
# The route handler writes bare SQL. RLS does the isolation.
# A SELECT * FROM records here returns only the current tenant's rows.
# An INSERT that mismatches tenant_id is rejected by the database.
# This is what "database enforces truth" looks like in practice.

import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, get_current_user
from app.schemas.schemas import RecordCreate, RecordOut

router = APIRouter(prefix="/records", tags=["records"])


@router.get("/", response_model=list[RecordOut])
async def list_records(
    db: AsyncSession = Depends(get_db),
):
    """
    No filter. RLS returns exactly what this tenant owns.
    If you're NPA admin, you see NPA records.
    If you're Strata Stone analyst, you see Strata Stone records.
    The query is identical for both — the database decides.
    """
    result = await db.execute(
        text("SELECT * FROM records ORDER BY created_at DESC")
    )
    return [dict(row) for row in result.mappings()]


@router.post("/", response_model=RecordOut, status_code=status.HTTP_201_CREATED)
async def create_record(
    body: RecordCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    The WITH CHECK policy on INSERT enforces:
    1. tenant_id matches session context (no cross-tenant write)
    2. role is 'admin' or 'analyst' (viewers cannot write)

    If either fails, PostgreSQL raises a policy violation.
    FastAPI never sees it coming — it just gets a 500 from the DB
    which we translate to 403.
    """
    record_id = str(uuid.uuid4())
    try:
        result = await db.execute(
            text("""
                INSERT INTO records (id, tenant_id, created_by, label, payload)
                VALUES (
                    :id,
                    :tenant_id::uuid,
                    :user_id::uuid,
                    :label,
                    :payload::jsonb
                )
                RETURNING *
            """),
            {
                "id":        record_id,
                "tenant_id": user["tenant_id"],
                "user_id":   user["user_id"],
                "label":     body.label,
                "payload":   __import__('json').dumps(body.payload),
            },
        )
        row = result.mappings().first()
        return dict(row)
    except Exception as e:
        if "policy" in str(e).lower() or "violates" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient role to create records",
            )
        raise


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_record(
    record_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Only admins can delete (rls_delete policy).
    Non-admin requests silently affect 0 rows (RLS filters them out).
    """
    result = await db.execute(
        text("DELETE FROM records WHERE id = :id RETURNING id"),
        {"id": record_id},
    )
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Record not found or access denied")
