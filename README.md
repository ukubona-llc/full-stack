# Ukubona Core

Multi-tenant full-stack: JWT auth + PostgreSQL RLS + FastAPI + Vite/React.

## The Architecture

```
JWT (Limbic)          →  identity minted at login
FastAPI (PFC)         →  thin router, injects session context
SET LOCAL app.*       →  the hinge: JWT crosses into DB here
PostgreSQL RLS (Spinothalamic) →  enforces isolation, non-bypassable
Vite/React (Corticothalamic)   →  renders what RLS permits
```

## Run with Docker (recommended)

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend:  http://localhost:8000/docs
- DB:       localhost:5432

## Run locally (without Docker)

### Backend

```bash
cd backend
pip install -r requirements.txt
# Start PostgreSQL, then:
psql -U postgres -f schema.sql
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/postgres \
  uvicorn app.main:app --reload
```

### Frontend     

```bash
cd frontend
npm install
npm run dev
```

## Demo Users (password: `password123`)

| Email                   | Tenant             | Role     | Can write | Can delete |
|-------------------------|--------------------|----------|-----------|------------|
| admin@npa.go.ug         | National Planning Authority | admin    | yes       | yes        |
| analyst@npa.go.ug       | National Planning Authority | analyst  | yes       | no         |
| admin@stratastone.com   | Strata Stone Partners       | admin    | yes       | yes        |

## The Proof

Log in as NPA Admin → create some records → log out.
Log in as Strata Stone Admin → fetch records → you see zero.

No frontend filtering. No WHERE clause in the API.
`SELECT * FROM records` returns only your tenant's rows.
**The database enforces reality.**

## The Critical Code

`backend/app/core/dependencies.py` — `get_db()`:

```python
async def get_db(user: dict = Depends(get_current_user)):
    async with AsyncSessionLocal() as session:
        await session.execute(text("""
            SET LOCAL app.user_id   = :user_id;
            SET LOCAL app.tenant_id = :tenant_id;
            SET LOCAL app.role      = :role;
        """), {...})
        yield session
```

`SET LOCAL` (not `SET`) — resets at transaction end,
preventing context leaks across pooled connections.

## RLS Policies

```sql
-- Read: tenant isolation
CREATE POLICY rls_select ON records FOR SELECT
USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Write: tenant isolation + role guard
CREATE POLICY rls_insert ON records FOR INSERT
WITH CHECK (
    tenant_id = current_setting('app.tenant_id')::uuid
    AND current_setting('app.role') IN ('admin', 'analyst')
);

-- Delete: admin only
CREATE POLICY rls_delete ON records FOR DELETE
USING (
    tenant_id = current_setting('app.tenant_id')::uuid
    AND current_setting('app.role') = 'admin'
);
```

## Project Structure

```
ukubona-core/
├── backend/
│   ├── app/
│   │   ├── api/          auth.py, records.py, audit.py
│   │   ├── core/         security.py, dependencies.py
│   │   ├── db/           session.py
│   │   ├── schemas/      schemas.py
│   │   └── main.py
│   ├── schema.sql        ← tables + RLS + seed data
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── lib/api.ts    ← JWT interceptor
│   │   └── App.tsx       ← full UI
│   └── vite.config.ts
└── docker-compose.yml
```

---

Now I have the full picture. You want **option B** — end-to-end, runnable — and the philosophical mapping tells me exactly what the UI should feel like.

Let me build it.Now I'll generate the complete artifact — backend files + a React demo that you can run locally.Now the frontend — Ukubona house aesthetic, fully wired to the backend:21 files. Here's what you have and what each one does:

**To run it:**
```bash
tar xzf ukubona-core.tar.gz
cd ukubona-core
docker compose up --build
# → frontend: localhost:5173  backend: localhost:8000/docs
```

---

**The architecture, file by file:**

`schema.sql` — the ontology. Three tables, four RLS policies, an audit trigger. The `ALTER DATABASE SET app.* = ''` guards ensure a bare connection without context gets blocked, not silently passed through.

`dependencies.py` — the hinge. This is the one file that matters most. `get_db()` takes `user: dict = Depends(get_current_user)` and immediately fires `SET LOCAL app.*` before yielding the session. `SET LOCAL` (not `SET`) is deliberate — it resets at transaction end, so pooled connections can't leak one user's context into another request.

`records.py` — the proof. Not a single `WHERE tenant_id = ...` in the route handlers. `SELECT * FROM records` returns only what RLS permits for the current session context. The database is the final authority.

`App.tsx` — three demo users, two tenants. Login as NPA Admin, create records, logout. Login as Strata Stone Admin, fetch records — zero rows. No frontend filtering involved.

---

**The one thing to change before production:** `SECRET_KEY` in `security.py` — pull it from an environment variable. Everything else is structurally sound for a real deployment.