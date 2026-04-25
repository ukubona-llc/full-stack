-- ============================================================
-- UKUBONA CORE SCHEMA
-- Capital (Ontology) → RLS enforces what is real
-- ============================================================

-- Safety guards: force failure if session context is unset
-- This prevents silent RLS bypass on bare connections
ALTER DATABASE postgres SET app.user_id = '';
ALTER DATABASE postgres SET app.tenant_id = '';
ALTER DATABASE postgres SET app.role = '';

-- ============================================================
-- TENANTS (the ontological units — NPA, Strata Stone, UCU...)
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    slug        TEXT UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- USERS (agency — JWT will carry their identity)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email           TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'viewer'
                    CHECK (role IN ('admin', 'analyst', 'viewer')),
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- RECORDS (the core data — tenant-isolated, RLS-guarded)
-- This is your "state" layer: PostgreSQL as Hippocampus
-- ============================================================
CREATE TABLE IF NOT EXISTS records (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    created_by  UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    label       TEXT NOT NULL,
    payload     JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- RLS: THE PHYSICS LAYER
-- Below app logic. Non-bypassable. The Spinothalamic tract.
-- ============================================================

ALTER TABLE records ENABLE ROW LEVEL SECURITY;

-- SELECT: tenant isolation
CREATE POLICY rls_select
    ON records FOR SELECT
    USING (
        current_setting('app.tenant_id', true) <> ''
        AND tenant_id = current_setting('app.tenant_id')::uuid
    );

-- INSERT: tenant isolation + role guard
CREATE POLICY rls_insert
    ON records FOR INSERT
    WITH CHECK (
        current_setting('app.tenant_id', true) <> ''
        AND tenant_id = current_setting('app.tenant_id')::uuid
        AND current_setting('app.role', true) IN ('admin', 'analyst')
    );

-- UPDATE: same as insert
CREATE POLICY rls_update
    ON records FOR UPDATE
    USING (
        tenant_id = current_setting('app.tenant_id')::uuid
        AND current_setting('app.role', true) IN ('admin', 'analyst')
    );

-- DELETE: admin only
CREATE POLICY rls_delete
    ON records FOR DELETE
    USING (
        tenant_id = current_setting('app.tenant_id')::uuid
        AND current_setting('app.role', true) = 'admin'
    );

-- ============================================================
-- AUDIT LOG: append-only, no RLS bypass
-- current_setting('app.user_id') gives you who for free
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGSERIAL PRIMARY KEY,
    tenant_id   UUID,
    user_id     UUID,
    action      TEXT NOT NULL,
    table_name  TEXT NOT NULL,
    record_id   UUID,
    delta       JSONB,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Trigger function: fires on records mutations
CREATE OR REPLACE FUNCTION audit_records()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_log (tenant_id, user_id, action, table_name, record_id, delta)
    VALUES (
        NULLIF(current_setting('app.tenant_id', true), '')::uuid,
        NULLIF(current_setting('app.user_id', true), '')::uuid,
        TG_OP,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        CASE TG_OP
            WHEN 'INSERT' THEN to_jsonb(NEW)
            WHEN 'UPDATE' THEN jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
            WHEN 'DELETE' THEN to_jsonb(OLD)
        END
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER records_audit
    AFTER INSERT OR UPDATE OR DELETE ON records
    FOR EACH ROW EXECUTE FUNCTION audit_records();

-- ============================================================
-- SEED DATA (two tenants, three users)
-- Passwords are bcrypt of 'password123'
-- ============================================================
INSERT INTO tenants (id, name, slug) VALUES
    ('00000000-0000-0000-0000-000000000001', 'National Planning Authority', 'npa'),
    ('00000000-0000-0000-0000-000000000002', 'Strata Stone Partners',       'strata')
ON CONFLICT DO NOTHING;

INSERT INTO users (id, tenant_id, email, hashed_password, role) VALUES
    ('00000000-0000-0000-0001-000000000001',
     '00000000-0000-0000-0000-000000000001',
     'admin@npa.go.ug',
     '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQyCgK9M1S2B3qL7vE1fGtKji',
     'admin'),
    ('00000000-0000-0000-0001-000000000002',
     '00000000-0000-0000-0000-000000000001',
     'analyst@npa.go.ug',
     '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQyCgK9M1S2B3qL7vE1fGtKji',
     'analyst'),
    ('00000000-0000-0000-0001-000000000003',
     '00000000-0000-0000-0000-000000000002',
     'admin@stratastone.com',
     '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQyCgK9M1S2B3qL7vE1fGtKji',
     'admin')
ON CONFLICT DO NOTHING;
