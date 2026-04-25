import { useState, useEffect, useCallback } from 'react'
import { login, getRecords, createRecord, deleteRecord, getAuditLog, type UkbUser } from './lib/api'

const DEMO_USERS = [
  { label: 'NPA Admin',          email: 'admin@npa.go.ug',       password: 'password123', role: 'admin',    tenant: 'NPA' },
  { label: 'NPA Analyst',        email: 'analyst@npa.go.ug',     password: 'password123', role: 'analyst',  tenant: 'NPA' },
  { label: 'Strata Stone Admin', email: 'admin@stratastone.com', password: 'password123', role: 'admin',    tenant: 'Strata' },
]

const ROLE_COLOR: Record<string, string> = {
  admin:   '#4ade80',
  analyst: '#60a5fa',
  viewer:  '#a78bfa',
}

function App() {
  const [user, setUser]           = useState<UkbUser | null>(null)
  const [records, setRecords]     = useState<any[]>([])
  const [audit, setAudit]         = useState<any[]>([])
  const [newLabel, setNewLabel]   = useState('')
  const [tab, setTab]             = useState<'records'|'audit'>('records')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [loginIdx, setLoginIdx]   = useState(0)

  const fetchAll = useCallback(async () => {
    try {
      const [r, a] = await Promise.all([getRecords(), getAuditLog()])
      setRecords(r)
      setAudit(a)
    } catch {}
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('ukb_user')
    if (stored) {
      const u = JSON.parse(stored)
      setUser(u)
    }
  }, [])

  useEffect(() => {
    if (user) fetchAll()
  }, [user, fetchAll])

  const handleLogin = async () => {
    setLoading(true); setError('')
    const demo = DEMO_USERS[loginIdx]
    try {
      const u = await login(demo.email, demo.password)
      localStorage.setItem('ukb_token', u.access_token)
      localStorage.setItem('ukb_user', JSON.stringify(u))
      setUser(u)
    } catch {
      setError('Login failed — is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('ukb_token')
    localStorage.removeItem('ukb_user')
    setUser(null); setRecords([]); setAudit([])
  }

  const handleCreate = async () => {
    if (!newLabel.trim()) return
    setLoading(true)
    try {
      await createRecord(newLabel, { source: 'ukubona-ui' })
      setNewLabel('')
      await fetchAll()
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Create failed')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteRecord(id)
      await fetchAll()
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Delete failed — admin only')
    }
  }

  // ── Login screen ──────────────────────────────────────────────────────────
  if (!user) return (
    <div style={styles.root}>
      <div style={styles.loginCard}>
        <div style={styles.spectrum} />
        <div style={{ padding: '2.5rem' }}>
          <p style={styles.eyebrow}>UKUBONA LLC</p>
          <h1 style={styles.title}>Multi-Tenant<br />Auth Demo</h1>
          <p style={styles.subtitle}>
            JWT → RLS boundary demonstration.<br />
            Each user sees only their tenant's data.
          </p>

          <div style={{ marginBottom: '1.5rem' }}>
            <p style={styles.label}>Login as</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {DEMO_USERS.map((u, i) => (
                <button
                  key={i}
                  onClick={() => setLoginIdx(i)}
                  style={{
                    ...styles.userBtn,
                    borderColor: loginIdx === i ? '#e2c98a' : 'rgba(255,255,255,0.1)',
                    background: loginIdx === i ? 'rgba(226,201,138,0.08)' : 'transparent',
                  }}
                >
                  <span style={{ color: ROLE_COLOR[u.role], fontSize: 11, fontFamily: 'monospace', letterSpacing: 1 }}>
                    {u.role.toUpperCase()}
                  </span>
                  <span style={{ color: '#e8e4d8', fontSize: 14 }}>{u.label}</span>
                  <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginLeft: 'auto' }}>{u.tenant}</span>
                </button>
              ))}
            </div>
          </div>

          {error && <p style={styles.errorText}>{error}</p>}

          <button onClick={handleLogin} disabled={loading} style={styles.loginBtn}>
            {loading ? 'Authenticating…' : 'Login →'}
          </button>

          <div style={styles.stack}>
            {['PostgreSQL + RLS', 'FastAPI + JWT', 'Vite + React'].map(s => (
              <span key={s} style={styles.pill}>{s}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  // ── Authenticated shell ───────────────────────────────────────────────────
  const canWrite = user.role === 'admin' || user.role === 'analyst'
  const canDelete = user.role === 'admin'

  return (
    <div style={styles.root}>
      <div style={styles.shell}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.spectrum} />
          <div style={{ padding: '1.25rem 1.75rem', display: 'flex', alignItems: 'center', gap: 16 }}>
            <p style={{ ...styles.eyebrow, margin: 0 }}>UKUBONA</p>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: ROLE_COLOR[user.role], fontSize: 11, fontFamily: 'monospace', letterSpacing: 1 }}>
                {user.role.toUpperCase()}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                {user.tenant_id.slice(0, 8)}…
              </span>
              <button onClick={handleLogout} style={styles.logoutBtn}>Logout</button>
            </div>
          </div>
        </div>

        {/* Proof panel */}
        <div style={styles.proofPanel}>
          <div style={styles.proofItem}>
            <span style={styles.proofLabel}>tenant_id</span>
            <span style={styles.proofValue}>{user.tenant_id}</span>
          </div>
          <div style={styles.proofItem}>
            <span style={styles.proofLabel}>role</span>
            <span style={{ ...styles.proofValue, color: ROLE_COLOR[user.role] }}>{user.role}</span>
          </div>
          <div style={styles.proofItem}>
            <span style={styles.proofLabel}>records visible</span>
            <span style={styles.proofValue}>{records.length} (RLS-filtered)</span>
          </div>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          {(['records', 'audit'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              ...styles.tab,
              borderBottom: tab === t ? '2px solid #e2c98a' : '2px solid transparent',
              color: tab === t ? '#e2c98a' : 'rgba(255,255,255,0.4)',
            }}>{t}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem 1.75rem', flex: 1 }}>
          {error && (
            <div style={styles.errorBanner}>
              {error}
              <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', marginLeft: 'auto' }}>×</button>
            </div>
          )}

          {tab === 'records' && (
            <>
              {canWrite && (
                <div style={styles.createRow}>
                  <input
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    placeholder="Record label…"
                    style={styles.input}
                  />
                  <button onClick={handleCreate} disabled={loading || !newLabel.trim()} style={styles.createBtn}>
                    + Create
                  </button>
                </div>
              )}

              {records.length === 0 ? (
                <div style={styles.empty}>
                  <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
                    No records for this tenant yet.{canWrite ? ' Create one above.' : ''}
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {records.map((r: any) => (
                    <div key={r.id} style={styles.recordRow}>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, color: '#e8e4d8', fontSize: 14 }}>{r.label}</p>
                        <p style={{ margin: '2px 0 0', color: 'rgba(255,255,255,0.3)', fontSize: 11, fontFamily: 'monospace' }}>
                          {r.id}
                        </p>
                      </div>
                      <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>
                        {new Date(r.created_at).toLocaleString()}
                      </span>
                      {canDelete && (
                        <button onClick={() => handleDelete(r.id)} style={styles.deleteBtn}>×</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'audit' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {audit.length === 0 ? (
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>No audit entries yet.</p>
              ) : audit.map((a: any) => (
                <div key={a.id} style={styles.auditRow}>
                  <span style={{
                    ...styles.actionBadge,
                    background: a.action === 'INSERT' ? 'rgba(74,222,128,0.12)' : a.action === 'DELETE' ? 'rgba(248,113,113,0.12)' : 'rgba(96,165,250,0.12)',
                    color: a.action === 'INSERT' ? '#4ade80' : a.action === 'DELETE' ? '#f87171' : '#60a5fa',
                  }}>{a.action}</span>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'monospace' }}>
                    {a.record_id?.slice(0, 8)}…
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, marginLeft: 'auto' }}>
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: '#0e0d0b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '"Cormorant Garamond", Georgia, serif',
    padding: '2rem',
  },
  loginCard: {
    width: '100%',
    maxWidth: 480,
    background: '#161510',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  shell: {
    width: '100%',
    maxWidth: 680,
    background: '#161510',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 12,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 600,
  },
  spectrum: {
    height: 3,
    background: 'linear-gradient(to right, #f87171, #fb923c, #fbbf24, #4ade80, #60a5fa, #818cf8, #c084fc)',
  },
  header: {
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.3)',
    fontFamily: '"IBM Plex Mono", monospace',
    margin: '0 0 0.75rem',
  },
  title: {
    fontSize: 36,
    fontWeight: 400,
    color: '#e8e4d8',
    margin: '0 0 0.75rem',
    lineHeight: 1.15,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.4)',
    lineHeight: 1.6,
    margin: '0 0 2rem',
  },
  label: {
    fontSize: 11,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.3)',
    fontFamily: '"IBM Plex Mono", monospace',
    margin: '0 0 0.5rem',
  },
  userBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'all 0.15s',
    textAlign: 'left',
    width: '100%',
  },
  loginBtn: {
    width: '100%',
    padding: '12px',
    background: '#e2c98a',
    color: '#0e0d0b',
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontFamily: '"IBM Plex Mono", monospace',
    cursor: 'pointer',
    letterSpacing: 1,
    marginBottom: '1.5rem',
  },
  stack: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap' as const,
  },
  pill: {
    fontSize: 11,
    padding: '3px 10px',
    borderRadius: 20,
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.3)',
    fontFamily: '"IBM Plex Mono", monospace',
  },
  proofPanel: {
    display: 'flex',
    gap: 0,
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: '#0e0d0b',
  },
  proofItem: {
    flex: 1,
    padding: '0.75rem 1.25rem',
    borderRight: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  proofLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.25)',
    fontFamily: '"IBM Plex Mono", monospace',
    letterSpacing: 1,
  },
  proofValue: {
    fontSize: 12,
    color: '#e8e4d8',
    fontFamily: '"IBM Plex Mono", monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    padding: '0 1.75rem',
  },
  tab: {
    padding: '0.75rem 0',
    marginRight: '1.5rem',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: '"IBM Plex Mono", monospace',
    letterSpacing: 1,
  },
  createRow: {
    display: 'flex',
    gap: 8,
    marginBottom: '1rem',
  },
  input: {
    flex: 1,
    padding: '9px 12px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color: '#e8e4d8',
    fontSize: 14,
    fontFamily: '"Cormorant Garamond", serif',
    outline: 'none',
  },
  createBtn: {
    padding: '9px 16px',
    background: '#e2c98a',
    color: '#0e0d0b',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: '"IBM Plex Mono", monospace',
    cursor: 'pointer',
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '3rem',
  },
  recordRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.05)',
    borderRadius: 6,
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(248,113,113,0.5)',
    cursor: 'pointer',
    fontSize: 16,
    padding: '0 4px',
  },
  auditRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '7px 12px',
    background: 'rgba(255,255,255,0.02)',
    borderRadius: 4,
  },
  actionBadge: {
    fontSize: 10,
    fontFamily: '"IBM Plex Mono", monospace',
    letterSpacing: 1,
    padding: '2px 8px',
    borderRadius: 4,
  },
  logoutBtn: {
    padding: '5px 12px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 5,
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: '"IBM Plex Mono", monospace',
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 13,
    margin: '0.5rem 0',
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    background: 'rgba(248,113,113,0.08)',
    border: '1px solid rgba(248,113,113,0.2)',
    borderRadius: 6,
    color: '#fca5a5',
    fontSize: 13,
    marginBottom: '1rem',
  },
}

export default App
