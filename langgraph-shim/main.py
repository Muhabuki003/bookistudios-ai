"""
LangGraph-compatible shim for the bookistudios AI office frontend.

The deer-flow style frontend talks to a LangGraph server at /api/langgraph.
No such server existed, so every "send message" died with a 404 HTML dump.
This shim implements the small subset of the LangGraph API the frontend
actually uses and streams responses from DeepSeek (OpenAI-compatible).

Endpoints:
  POST   /threads                      create thread
  POST   /threads/search               list threads
  GET    /threads/{thread_id}          get thread
  DELETE /threads/{thread_id}          delete thread
  GET    /threads/{thread_id}/state    get current state
  POST   /threads/{thread_id}/history  state history (latest only)
  POST   /threads/{thread_id}/runs/stream   SSE run stream
  GET    /health                       health check
"""

import json
import os
import time
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

# ── Config ─────────────────────────────────────────────────────────────────
DATA_DIR = Path(os.environ.get("SHIM_DATA", "/root/bookistudios-ai/langgraph-shim/data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

DEEPSEEK_BASE = os.environ.get("LLM_BASE_URL", "https://api.deepseek.com/v1")
MODEL = os.environ.get("LLM_MODEL", "deepseek-chat")
SYSTEM_PROMPT = os.environ.get(
    "LLM_SYSTEM_PROMPT",
    "You are the BookiStudios AI office assistant. Be helpful, direct and concise.",
)

USERS_FILE = Path("/root/bookistudios-ai/office-data/office_users.json")


def _user_name(email: str) -> str:
    """Display name for the account, from the office users file (never the
    hardcoded owner identity — every account is its own user)."""
    try:
        users = json.loads(USERS_FILE.read_text())
        rec = users.get(email) or {}
        return str(rec.get("name", "")).strip()
    except (OSError, json.JSONDecodeError, AttributeError):
        return ""

def _load_api_key() -> str:
    key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if key:
        return key
    env_file = Path("/root/.hermes/.env")
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("DEEPSEEK_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""

API_KEY = _load_api_key()

# ── App ────────────────────────────────────────────────────────────────────
app = FastAPI(title="bookistudios-langgraph-shim")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Location"],
)

LOCK = threading.Lock()

# ── Thread storage ─────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


SESSIONS_FILE = Path("/root/bookistudios-ai/office-data/office_sessions.json")
SESSION_COOKIE = "access_token"


def _user_email_from_request(req) -> str | None:
    token = req.cookies.get(SESSION_COOKIE) or ""
    if not token:
        return None
    try:
        sessions = json.loads(SESSIONS_FILE.read_text())
    except (OSError, json.JSONDecodeError):
        return None
    session = sessions.get(token)
    if not session:
        return None
    if float(session.get("expiry", 0)) < time.time():
        return None
    return session.get("email")


def _require_email(req) -> str:
    email = _user_email_from_request(req)
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return email


def _user_dir(email: str) -> Path:
    safe = "".join(c for c in email if c.isalnum() or c in "@._-")
    d = DATA_DIR / safe
    d.mkdir(parents=True, exist_ok=True)
    return d


def _thread_path(email: str, thread_id: str) -> Path:
    safe = "".join(c for c in thread_id if c.isalnum() or c in "-_")
    return _user_dir(email) / f"{safe}.json"


def _load_thread(email: str, thread_id: str) -> dict:
    p = _thread_path(email, thread_id)
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"Thread {thread_id} not found")
    return json.loads(p.read_text())


def _save_thread(email: str, thread: dict) -> None:
    p = _thread_path(email, thread["thread_id"])
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(thread, default=str))
    tmp.replace(p)


def _make_title(text) -> str:
    """Normalize a message into a short sidebar title (~100 chars)."""
    return " ".join(str(text).split())[:100]


def _thread_title(thread: dict) -> str | None:
    """Return the thread title, deriving it from the first human message if
    it is not stored yet (legacy threads predate title tracking)."""
    title = thread.get("title")
    if title:
        return str(title)
    for m in thread.get("messages", []):
        if m.get("type") == "human":
            derived = _make_title(_flatten_content(m.get("content", "")))
            return derived or None
    return None


def _values_with_title(thread: dict) -> dict:
    values = {"messages": thread.get("messages", [])}
    title = _thread_title(thread)
    if title:
        values["title"] = title
    return values


def _public_thread(thread: dict) -> dict:
    return {
        "thread_id": thread["thread_id"],
        "created_at": thread["created_at"],
        "updated_at": thread["updated_at"],
        "metadata": thread.get("metadata", {}),
        "status": thread.get("status", "idle"),
        "values": _values_with_title(thread),
        "interrupts": {},
    }

# ── Message helpers ────────────────────────────────────────────────────────

def _flatten_content(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                parts.append(part.get("text", ""))
            elif isinstance(part, str):
                parts.append(part)
        return "".join(parts)
    return str(content or "")


def _to_openai_messages(thread_messages: list, new_messages: list, email: str | None = None) -> list:
    prompt = SYSTEM_PROMPT
    if email:
        name = _user_name(email)
        if name:
            prompt += (
                f" The person you are speaking with is {name} (account {email}). "
                "Address them by name when natural. Do not assume they are anyone "
                "other than the account owner."
            )
        else:
            prompt += (
                f" The person you are speaking with uses the account {email}. "
                "Do not assume they are anyone other than the account owner."
            )
    out = [{"role": "system", "content": prompt}]
    for m in thread_messages + new_messages:
        mtype = m.get("type") or m.get("role", "human")
        role = {"human": "user", "ai": "assistant", "system": "system"}.get(mtype)
        if role is None:
            continue
        text = _flatten_content(m.get("content"))
        if text:
            out.append({"role": role, "content": text})
    return out

# ── Endpoints ──────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL, "api_key_set": bool(API_KEY)}


@app.post("/threads")
def create_thread(request: Request, body: dict | None = None):
    body = body or {}
    email = _require_email(request)
    thread = {
        "thread_id": uuid.uuid4().hex,
        "created_at": _now(),
        "updated_at": _now(),
        "metadata": body.get("metadata", {}),
        "owner": email,
        "status": "idle",
        "messages": [],
    }
    with LOCK:
        _save_thread(email, thread)
    return _public_thread(thread)


@app.post("/threads/search")
def search_threads(request: Request, body: dict | None = None):
    body = body or {}
    email = _require_email(request)
    limit = int(body.get("limit", 50) or 50)
    offset = int(body.get("offset", 0) or 0)
    threads = []
    for p in _user_dir(email).glob("*.json"):
        try:
            threads.append(json.loads(p.read_text()))
        except (json.JSONDecodeError, OSError):
            continue
    threads.sort(key=lambda t: t.get("updated_at", ""), reverse=True)
    return [_public_thread(t) for t in threads[offset : offset + limit]]


@app.get("/threads/{thread_id}")
def get_thread(request: Request, thread_id: str):
    email = _require_email(request)
    return _public_thread(_load_thread(email, thread_id))


@app.delete("/threads/{thread_id}")
def delete_thread(request: Request, thread_id: str):
    email = _require_email(request)
    p = _thread_path(email, thread_id)
    if p.exists():
        p.unlink()
    return {"ok": True}


@app.get("/threads/{thread_id}/state")
def get_state(request: Request, thread_id: str):
    email = _require_email(request)
    thread = _load_thread(email, thread_id)
    return {
        "values": _values_with_title(thread),
        "next": [],
        "config": {},
        "metadata": {},
        "created_at": thread["created_at"],
        "parent_config": None,
        "tasks": [],
        "interrupts": {},
    }


@app.post("/threads/{thread_id}/history")
def get_history(request: Request, thread_id: str, body: dict | None = None):
    email = _require_email(request)
    thread = _load_thread(email, thread_id)
    return [
        {
            "values": _values_with_title(thread),
            "next": [],
            "config": {},
            "metadata": {},
            "created_at": thread["created_at"],
            "parent_config": None,
            "tasks": [],
            "interrupts": {},
        }
    ]


@app.get("/threads/{thread_id}/token-usage")
def token_usage(request: Request, thread_id: str):
    email = _require_email(request)
    _load_thread(email, thread_id)
    return {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}


def _sse(event: str, data) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


@app.post("/threads/{thread_id}/runs/stream")
async def run_stream(request: Request, thread_id: str, body: dict):
    email = _require_email(request)
    thread = _load_thread(email, thread_id)
    run_id = uuid.uuid4().hex

    input_msgs = (body.get("input") or {}).get("messages") or []
    human_msgs = []
    for m in input_msgs:
        msg = {
            "type": m.get("type", "human"),
            "id": m.get("id") or uuid.uuid4().hex,
            "content": m.get("content", ""),
        }
        if m.get("additional_kwargs"):
            msg["additional_kwargs"] = m["additional_kwargs"]
        human_msgs.append(msg)

    openai_messages = _to_openai_messages(thread.get("messages", []), human_msgs, email)

    with LOCK:
        thread["messages"].extend(human_msgs)
        # First human message becomes the thread title (sidebar label).
        if not thread.get("title"):
            for m in thread["messages"]:
                if m.get("type") == "human":
                    title = _make_title(_flatten_content(m.get("content", "")))
                    if title:
                        thread["title"] = title
                    break
        thread["status"] = "busy"
        thread["updated_at"] = _now()
        _save_thread(email, thread)

    async def event_gen():
        ai_id = f"run-{run_id}"
        full_text = ""
        ok = False
        try:
            yield _sse("metadata", {"run_id": run_id, "thread_id": thread_id})
            # Register the human message before the AI chunks so the client keeps
            # normal chat order: question first, answer directly underneath.
            yield _sse("values", _values_with_title(thread))
            if not API_KEY:
                raise RuntimeError("LLM API key not configured on the shim")

            payload = {
                "model": MODEL,
                "messages": openai_messages,
                "stream": True,
            }
            headers = {"Authorization": f"Bearer {API_KEY}"}
            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as client:
                async with client.stream(
                    "POST", f"{DEEPSEEK_BASE}/chat/completions",
                    json=payload, headers=headers,
                ) as resp:
                    if resp.status_code != 200:
                        detail = (await resp.aread()).decode(errors="replace")[:500]
                        raise RuntimeError(f"LLM error {resp.status_code}: {detail}")
                    async for line in resp.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data)
                        except json.JSONDecodeError:
                            continue
                        for choice in chunk.get("choices", []):
                            delta = choice.get("delta", {})
                            token = delta.get("content")
                            if token:
                                full_text += token
                                yield _sse("messages-tuple", [
                                    {
                                        "type": "AIMessageChunk",
                                        "id": ai_id,
                                        "content": token,
                                        "additional_kwargs": {},
                                        "response_metadata": {},
                                        "tool_calls": [],
                                        "tool_call_chunks": [],
                                        "invalid_tool_calls": [],
                                    },
                                    {"langgraph_node": "chat", "langgraph_step": 1},
                                ])

            ai_msg = {
                "type": "ai",
                "id": ai_id,
                "content": full_text,
                "additional_kwargs": {},
                "response_metadata": {},
                "tool_calls": [],
                "invalid_tool_calls": [],
            }
            with LOCK:
                t = _load_thread(email, thread_id)
                t["messages"].append(ai_msg)
                t["status"] = "idle"
                t["updated_at"] = _now()
                _save_thread(email, t)
                all_messages = t["messages"]
            yield _sse("values", _values_with_title(t))
            ok = True
        except Exception as e:  # noqa: BLE001 - surface any failure as SSE error, never HTML
            with LOCK:
                try:
                    t = _load_thread(email, thread_id)
                    t["status"] = "idle"
                    _save_thread(email, t)
                except Exception:
                    pass
            yield _sse("error", {"error": "RunFailed", "message": str(e)})
        finally:
            if ok:
                yield _sse("end", {})

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            # The langgraph SDK reads this to learn the run's thread_id/run_id
            # (getRunMetadataFromResponse). Without it, onCreated never fires
            # and the frontend creates a NEW thread on every message.
            "Content-Location": f"/threads/{thread_id}/runs/{run_id}",
        },
    )


# ── Run listing (SDK: runs.list) ────────────────────────────────────────────

@app.get("/threads/{thread_id}/runs")
def list_runs(request: Request, thread_id: str):
    email = _require_email(request)
    thread = _load_thread(email, thread_id)
    runs = []
    for m in thread.get("messages", []):
        if m.get("type") == "ai" and str(m.get("id", "")).startswith("run-"):
            runs.append({
                "run_id": m["id"][4:],
                "thread_id": thread_id,
                "assistant_id": "deer",
                "created_at": thread["created_at"],
                "updated_at": thread["updated_at"],
                "status": "success",
                "metadata": {},
                "multitask_strategy": None,
            })
    return runs


@app.get("/threads/{thread_id}/runs/{run_id}/messages")
def run_messages(request: Request, thread_id: str, run_id: str):
    email = _require_email(request)
    thread = _load_thread(email, thread_id)
    return {
        "data": [
            {
                "run_id": run_id,
                "content": m,
                "metadata": {"caller": "lead_agent"},
                "created_at": thread["created_at"],
            }
            for m in thread.get("messages", [])
        ],
        "hasMore": False,
    }
