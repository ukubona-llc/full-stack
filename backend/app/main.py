# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, records, audit

app = FastAPI(
    title="Ukubona Core",
    description="Multi-tenant API with JWT auth and PostgreSQL RLS",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(records.router)
app.include_router(audit.router)


@app.get("/health")
async def health():
    return {"status": "ok", "system": "ukubona-core"}
