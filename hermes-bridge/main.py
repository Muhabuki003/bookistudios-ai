"""
Hermes Chat Bridge — message relay between a frontend dashboard and Hermes Agent.

Endpoints:
  POST /api/hermes/chat        — Accept a message from the dashboard, store it, return {id, status}
  GET  /api/hermes/pending     — Hermes polls for pending messages
  POST /api/hermes/respond     — Hermes submits a response to a message
  GET  /api/hermes/messages/{session_id} — Get all messages with responses for a session
  GET  /api/hermes/message/{message_id}  — Get a specific message with its response
  GET  /api/hermes/health      — Health check
"""

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Paths ──────────────────────────────────────────────────────────────────
DATA_DIR = Path(os.environ.get("HERMES_BRIDGE_DATA", "/data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
MESSAGES_FILE = DATA_DIR / "messages.json"
LOCK = Lock()

# ── App Setup ──────────────────────────────────────────────────────────────
app = FastAPI(title="Hermes Chat Bridge", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Models ─────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"

class ChatResponse(BaseModel):
    message_id: str
    session_id: str
    status: str
    timestamp: str

class RespondRequest(BaseModel):
    message_id: str
    response: str
    session_id: str

# ── Storage Helpers ────────────────────────────────────────────────────────

def _load_messages() -> dict:
    """Load all messages from the JSON file."""
    if MESSAGES_FILE.exists():
        try:
            return json.loads(MESSAGES_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            return {}
    return {}

def _save_messages(messages: dict) -> None:
    """Atomically save all messages to the JSON file."""
    tmp = MESSAGES_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(messages, indent=2, default=str))
    tmp.replace(MESSAGES_FILE)

# ── Endpoints ──────────────────────────────────────────────────────────────

@app.get("/api/hermes/health")
def health():
    return {
        "status": "ok",
        "service": "hermes-bridge",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/hermes/chat", response_model=ChatResponse)
def create_message(req: ChatRequest):
    """Accept a message from the dashboard, store it as pending."""
    message_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    entry = {
        "id": message_id,
        "session_id": req.session_id,
        "message": req.message,
        "status": "pending",
        "response": None,
        "created_at": now,
        "responded_at": None,
    }

    with LOCK:
        messages = _load_messages()
        if req.session_id not in messages:
            messages[req.session_id] = []
        messages[req.session_id].append(entry)
        _save_messages(messages)

    return ChatResponse(
        message_id=message_id,
        session_id=req.session_id,
        status="pending",
        timestamp=now,
    )


@app.get("/api/hermes/pending")
def get_pending():
    """Return all pending messages across all sessions. Used by Hermes to poll."""
    with LOCK:
        messages = _load_messages()

    pending = []
    for session_id, session_msgs in messages.items():
        for msg in session_msgs:
            if msg.get("status") == "pending":
                pending.append(msg)

    return {
        "pending_count": len(pending),
        "messages": pending,
    }


@app.post("/api/hermes/respond")
def submit_response(req: RespondRequest):
    """Hermes submits a response to a pending message."""
    with LOCK:
        messages = _load_messages()
        session_msgs = messages.get(req.session_id, [])
        found = False
        for msg in session_msgs:
            if msg["id"] == req.message_id:
                msg["status"] = "responded"
                msg["response"] = req.response
                msg["responded_at"] = datetime.now(timezone.utc).isoformat()
                found = True
                break

        if not found:
            raise HTTPException(
                status_code=404,
                detail=f"Message {req.message_id} not found in session {req.session_id}",
            )
        _save_messages(messages)

    return {
        "status": "ok",
        "message_id": req.message_id,
        "message_status": "responded",
    }


@app.get("/api/hermes/messages/{session_id}")
def get_session_messages(session_id: str):
    """Get all messages with responses for a session."""
    with LOCK:
        messages = _load_messages()

    session_msgs = messages.get(session_id, [])
    return {
        "session_id": session_id,
        "message_count": len(session_msgs),
        "messages": session_msgs,
    }


@app.get("/api/hermes/message/{message_id}")
def get_message(message_id: str):
    """Get a specific message by ID across all sessions."""
    with LOCK:
        messages = _load_messages()

    for session_id, session_msgs in messages.items():
        for msg in session_msgs:
            if msg["id"] == message_id:
                return msg

    raise HTTPException(status_code=404, detail=f"Message {message_id} not found")


# ── Entrypoint ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    host = os.environ.get("HERMES_BRIDGE_HOST", "0.0.0.0")
    port = int(os.environ.get("HERMES_BRIDGE_PORT", "8004"))
    uvicorn.run("main:app", host=host, port=port, reload=False)
