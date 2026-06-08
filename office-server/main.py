"""
BUKIMIND Office Event Server

WebSocket + REST server that serves as the real-time backbone for the
BUKIMIND virtual office. Hermes and Deerflow push events here, and
the office frontend connects via WebSocket for instant updates.

Endpoints:
  WS  /ws              — WebSocket for real-time office events
  GET /state           — Full current state snapshot
  GET /agents          — List all registered agents
  POST /events         — Push a new event (from Hermes/Deerflow)
  GET /files           — List boss desk files
  POST /files          — Register a boss desk file
  GET /files/{name}    — Download a boss desk file
"""

from __future__ import annotations

import json
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BOSS_DESK_DIR = Path("/app/boss-desk")
EVENTS_MAX_PER_ROOM = 100
STATE_VERSION = 1

# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

class EventData(BaseModel):
    """The payload inside an office event."""
    room: str = "hq"
    agent_id: str = "system"
    employee: str | None = None
    status: str | None = None
    task: str | None = None
    action: str | None = None
    currentFile: str | None = None
    snippet: str | None = None
    output: str | None = None
    msg: str | None = None
    color: str | None = "#5d7d96"
    activity: str | None = None
    lastActive: str | None = None
    recentActivity: list[dict] | None = None


class OfficeEvent(BaseModel):
    """An event pushed to the office."""
    type: str = Field(..., description="event type: agent_status|agent_activity|system_log|desk_delivery|state_sync|agent_online|agent_offline")
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))
    data: EventData


class AgentRegistration(BaseModel):
    """Register an agent for the Custom Agents room."""
    agent_id: str
    name: str
    employee: str
    room: str = "custom-agents"
    color: str = "#23e3ff"
    status: str = "idle"
    task: str = "Standing by"


class FileRegistration(BaseModel):
    """Register a file on the boss desk."""
    title: str
    ext: str
    file: str
    time: str | None = None


# ---------------------------------------------------------------------------
# In-memory state
# ---------------------------------------------------------------------------

class OfficeState:
    """Holds all runtime state for the office."""

    def __init__(self):
        self.rooms: dict[str, dict] = {
            "hq": {
                "name": "BUKIMIND HQ",
                "agents": [],
                "metrics": {"tasks": 0, "prs": 0, "rooms": 0, "bars": {}},
            },
            "custom-agents": {
                "name": "Custom Agents",
                "agents": [],
                "metrics": {"tasks": 0, "agents": 0, "prs": 0, "bars": {}},
            },
        }
        self.events: dict[str, list[dict]] = {}  # room_id -> list of log entries
        self.desk_items: list[dict] = []
        self.websockets: set[WebSocket] = set()
        self._agent_registry: dict[str, AgentRegistration] = {}

    def add_event(self, event: OfficeEvent) -> None:
        """Add an event to the room's log."""
        rid = event.data.room or "hq"
        if rid not in self.events:
            self.events[rid] = []

        entry = {
            "t": event.timestamp[-12:-4] if len(event.timestamp) > 12 else event.timestamp,
            "agent": event.data.agent_id,
            "msg": event.data.msg or event.data.task or event.data.action or "",
            "color": event.data.color or "#5d7d96",
            "employee": event.data.employee,
            "type": event.type,
            "timestamp": event.timestamp,
        }
        self.events[rid].insert(0, entry)
        if len(self.events[rid]) > EVENTS_MAX_PER_ROOM:
            self.events[rid].pop()

    def update_agent(self, data: EventData) -> None:
        """Update agent state in the appropriate room."""
        rid = data.room or "custom-agents"
        if rid not in self.rooms:
            return
        agents = self.rooms[rid].get("agents", [])
        existing = None
        for a in agents:
            if a.get("id") == data.agent_id:
                existing = a
                break
        if not existing:
            existing = {"id": data.agent_id}
            agents.append(existing)

        if data.status is not None:
            existing["status"] = data.status
        if data.task is not None:
            existing["task"] = data.task
        if data.action is not None:
            existing["action"] = data.action
        if data.currentFile is not None:
            existing["currentFile"] = data.currentFile
        if data.snippet is not None:
            existing["snippet"] = data.snippet
        if data.output is not None:
            existing["output"] = data.output
        if data.activity is not None:
            existing["activity"] = data.activity
        if data.lastActive is not None:
            existing["lastActive"] = data.lastActive
        if data.recentActivity is not None:
            existing["recentActivity"] = data.recentActivity
        if data.employee is not None:
            existing["employee"] = data.employee

    def add_custom_agent(self, reg: AgentRegistration) -> None:
        """Add an employee-created agent to the Custom Agents room."""
        rid = "custom-agents"
        agents = self.rooms[rid]["agents"]
        # Remove if already exists
        agents[:] = [a for a in agents if a.get("id") != reg.agent_id]
        agents.append({
            "id": reg.agent_id,
            "name": reg.name,
            "employee": reg.employee,
            "status": reg.status,
            "task": reg.task,
            "color": reg.color,
            "action": "Standing by",
            "currentFile": "",
            "snippet": "",
        })
        self.rooms[rid]["metrics"]["agents"] = len(agents)
        self._agent_registry[reg.agent_id] = reg

    def remove_custom_agent(self, agent_id: str) -> None:
        """Remove an employee-created agent."""
        rid = "custom-agents"
        self.rooms[rid]["agents"] = [a for a in self.rooms[rid]["agents"] if a.get("id") != agent_id]
        self.rooms[rid]["metrics"]["agents"] = len(self.rooms[rid]["agents"])
        self._agent_registry.pop(agent_id, None)

    def get_snapshot(self) -> dict:
        """Get the full state snapshot for initial load."""
        return {
            "version": STATE_VERSION,
            "updated": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "current_room": "hq",
            "rooms": self.rooms,
            "events": self.events,
            "desk_items": self.desk_items,
        }

    async def broadcast(self, message: dict) -> None:
        """Send a message to all connected WebSocket clients."""
        dead = set()
        for ws in self.websockets:
            try:
                await ws.send_json(message)
            except Exception:
                dead.add(ws)
        self.websockets -= dead


# Global state
state = OfficeState()

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(title="BUKIMIND Office Event Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    state.websockets.add(ws)

    # Send initial state
    try:
        await ws.send_json({
            "type": "state_sync",
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "data": state.get_snapshot(),
        })
    except Exception:
        state.websockets.discard(ws)
        return

    try:
        while True:
            # Keep connection alive / handle incoming messages
            data = await ws.receive_text()
            # Client can send ping/pong or commands
            if data == "ping":
                await ws.send_json({"type": "pong"})
            elif data.startswith("{"):
                try:
                    msg = json.loads(data)
                    if msg.get("type") == "set_room":
                        # Client is viewing a specific room
                        pass
                except json.JSONDecodeError:
                    pass
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        state.websockets.discard(ws)


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------

@app.get("/state")
async def get_state():
    """Full state snapshot for initial page load."""
    return state.get_snapshot()


@app.get("/agents")
async def list_agents():
    """List all registered agents across all rooms."""
    result = {}
    for rid, room in state.rooms.items():
        if room.get("agents"):
            result[rid] = [
                {"id": a["id"], "name": a.get("name", a["id"]),
                 "employee": a.get("employee"), "status": a.get("status", "idle"),
                 "task": a.get("task", "")}
                for a in room["agents"]
            ]
    return {"agents": result}


@app.post("/events")
async def push_event(event: OfficeEvent):
    """Push an event from Hermes or Deerflow."""
    dt = event.data

    # Update agent state
    if event.type in ("agent_status", "agent_activity", "agent_online"):
        state.update_agent(dt)

    # Handle online/offline
    if event.type == "agent_online":
        reg = state._agent_registry.get(dt.agent_id)
        if reg:
            state.add_custom_agent(reg)
    elif event.type == "agent_offline":
        state.remove_custom_agent(dt.agent_id)

    # Add to log
    state.add_event(event)

    # Handle desk delivery
    if event.type == "desk_delivery" and dt.msg:
        state.add_event(OfficeEvent(
            type="system_log",
            data=EventData(
                room=dt.room or "hq",
                agent_id="SYSTEM",
                msg=f"📄 {dt.msg}",
                color="#22e07a",
            )
        ))

    # Broadcast to all connected WebSocket clients
    await state.broadcast(event.model_dump())

    return {"ok": True, "type": event.type}


@app.post("/agents/register")
async def register_agent(reg: AgentRegistration):
    """Register a custom agent (employee-created) for the office."""
    state.add_custom_agent(reg)

    # Announce
    await state.broadcast({
        "type": "agent_online",
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "data": {
            "room": "custom-agents",
            "agent_id": reg.agent_id,
            "employee": reg.employee,
            "status": "idle",
            "task": "Online",
            "msg": f"{reg.employee}'s agent '{reg.name}' came online",
            "color": "#23e3ff",
        },
    })

    return {"ok": True, "agent_id": reg.agent_id}


@app.delete("/agents/{agent_id}")
async def unregister_agent(agent_id: str):
    """Remove a custom agent from the office."""
    state.remove_custom_agent(agent_id)

    await state.broadcast({
        "type": "agent_offline",
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "data": {"agent_id": agent_id, "msg": "Agent went offline", "color": "#ff5d6c"},
    })

    return {"ok": True}


@app.get("/files")
async def list_files():
    """List boss desk files."""
    items = []
    if BOSS_DESK_DIR.exists():
        for f in sorted(BOSS_DESK_DIR.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
            if f.is_file() and not f.name.startswith("."):
                ext = f.suffix[1:] if f.suffix else "bin"
                items.append({
                    "title": f.stem,
                    "ext": ext,
                    "file": f.name,
                    "time": datetime.fromtimestamp(f.stat().st_mtime).strftime("%H:%M:%S"),
                })
    return items


@app.post("/files")
async def register_file(reg: FileRegistration):
    """Register a desk item (file already placed in boss-desk/items/)."""
    entry = {
        "title": reg.title,
        "ext": reg.ext,
        "file": reg.file,
        "time": reg.time or datetime.now().strftime("%H:%M:%S"),
    }
    # Avoid duplicates
    state.desk_items = [d for d in state.desk_items if d.get("file") != reg.file]
    state.desk_items.append(entry)

    # Broadcast desk delivery
    await state.broadcast({
        "type": "desk_delivery",
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "data": {
            "agent_id": "Hermes",
            "title": reg.title,
            "ext": reg.ext,
            "file": reg.file,
            "msg": f"📄 {reg.title}.{reg.ext} placed on Boss Desk",
            "color": "#22e07a",
        },
    })

    return {"ok": True}


@app.get("/files/{name:path}")
async def download_file(name: str):
    """Download a boss desk file."""
    filepath = BOSS_DESK_DIR / name
    if not filepath.exists() or not filepath.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(
        path=str(filepath),
        filename=name,
        media_type="application/octet-stream",
    )


@app.get("/health")
async def health():
    return {"status": "ok", "rooms": list(state.rooms.keys()), "websockets": len(state.websockets)}
