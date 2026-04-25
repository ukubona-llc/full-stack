# app/api/audit.py
# The memory of the system. Who touched what, when.
# Driven by the PostgreSQL trigger — not application code.

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db, get_current_user

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/")
async def get_audit_log(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Admins and analysts see their tenant's audit log.
    The audit table is filtered by tenant_id in the query —
    no RLS on audit_log (it's append-only from SECURITY DEFINER trigger).
    """
    result = await db.execute(
        text("""
            SELECT id, user_id, action, table_name, record_id, created_at
            FROM audit_log
            WHERE tenant_id = :tenant_id
            ORDER BY created_at DESC
            LIMIT 50
        """),
        {"tenant_id": user["tenant_id"]},
    )
    return [dict(row) for row in result.mappings()]
