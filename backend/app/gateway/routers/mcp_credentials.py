"""Per-user MCP credential management endpoints.

Employees can connect their own accounts (Notion, Figma, Google Workspace)
to their agents. Credentials are stored per-user in the database.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.gateway.deps import get_current_user_from_request
from deerflow.mcp.user_credentials import (
    delete_user_credentials,
    get_user_credentials,
    save_user_credentials,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mcp", tags=["mcp-credentials"])


# ── Request/Response Models ──────────────────────────────────────────────


class CredentialEntry(BaseModel):
    """A single credential entry for one server."""

    server_name: str = Field(description="MCP server name (e.g. 'notion', 'figma', 'google-workspace')")
    status: str = Field(description="'connected' or 'disconnected'")
    services: list[str] = Field(default_factory=list, description="Services this server provides (e.g. ['notion database', 'notion pages'])")
    updated_at: str | None = Field(default=None, description="ISO timestamp of last update")


class CredentialListResponse(BaseModel):
    """List of credential entries for the current user."""

    credentials: list[CredentialEntry] = Field(default_factory=list)


class SaveCredentialRequest(BaseModel):
    """Request to save credentials for a server."""

    credentials: dict = Field(description="Credential payload, e.g. {'token': 'ntn_...'} or {'api_key': 'figd_...'}")


class SaveCredentialResponse(BaseModel):
    """Response after saving credentials."""

    server_name: str
    status: str = "connected"
    message: str = "Credentials saved successfully"


class DeleteCredentialResponse(BaseModel):
    """Response after disconnecting."""

    server_name: str
    status: str = "disconnected"
    message: str = "Credentials removed"


# Server metadata — describes available MCP servers users can connect
AVAILABLE_MCP_SERVERS: dict[str, dict] = {
    "notion": {
        "name": "Notion",
        "description": "Connect your Notion workspace — read/write pages, query databases, manage content",
        "services": ["Notion pages", "Notion databases", "Notion comments", "Notion files"],
        "credential_fields": [
            {"key": "token", "label": "Notion Personal Access Token", "type": "password", "placeholder": "ntn_xxxxxxxxxxxx"},
        ],
        "help_url": "https://www.notion.so/profile/integrations",
        "help_text": "Get your token from Notion → Settings → Connections → Develop or manage integrations → Personal access tokens",
    },
    "figma": {
        "name": "Figma",
        "description": "Connect Figma — fetch design data, layouts, and styling info",
        "services": ["Figma files", "Figma frames", "Figma components", "Design metadata"],
        "credential_fields": [
            {"key": "api_key", "label": "Figma Personal Access Token", "type": "password", "placeholder": "figd_xxxxxxxxxxxx"},
        ],
        "help_url": "https://www.figma.com/developers/api#access-tokens",
        "help_text": "Get your token from Figma → Settings → Account → Personal access tokens",
    },
    "google-workspace": {
        "name": "Google Workspace",
        "description": "Connect Google — Gmail, Calendar, Docs, Sheets, Drive, Slides, Forms",
        "services": ["Gmail", "Google Calendar", "Google Docs", "Google Sheets", "Google Drive", "Google Slides", "Google Forms"],
        "credential_fields": [
            {"key": "client_id", "label": "Google OAuth Client ID", "type": "text", "placeholder": "xxxxxxxx.apps.googleusercontent.com"},
            {"key": "client_secret", "label": "Google OAuth Client Secret", "type": "password", "placeholder": "GOCSPX-xxxxxxxxxxxx"},
            {"key": "refresh_token", "label": "Google OAuth Refresh Token", "type": "password", "placeholder": "1//xxxxxxxxxxxx"},
        ],
        "help_url": "https://console.cloud.google.com/apis/credentials",
        "help_text": "Create OAuth 2.0 credentials in Google Cloud Console → APIs & Services → Credentials → Desktop application type",
    },
}


@router.get(
    "/credentials",
    response_model=CredentialListResponse,
    summary="List user's connected MCP services",
    description="Returns which MCP servers the current user has connected (has credentials for).",
)
async def list_user_credentials(
    current_user=Depends(get_current_user_from_request),
) -> CredentialListResponse:
    """List the current user's connected MCP services."""
    user_id = str(current_user.id)
    stored = await get_user_credentials(user_id)

    entries: list[CredentialEntry] = []
    for server_name, meta in AVAILABLE_MCP_SERVERS.items():
        is_connected = server_name in stored
        entries.append(
            CredentialEntry(
                server_name=server_name,
                status="connected" if is_connected else "disconnected",
                services=meta["services"],
                updated_at=stored.get(server_name, {}).get("updated_at"),
            )
        )

    return CredentialListResponse(credentials=entries)


@router.get(
    "/credentials/servers",
    summary="List available MCP servers for connection",
    description="Returns the list of MCP servers users can connect with credential info.",
)
async def list_available_servers() -> dict:
    """Return metadata about all available MCP servers for the frontend UI."""
    return {"servers": AVAILABLE_MCP_SERVERS}


@router.get(
    "/credentials/{server_name}",
    summary="Get connected status for a specific server",
)
async def get_server_credential_status(
    server_name: str,
    current_user=Depends(get_current_user_from_request),
) -> dict:
    """Check if the user has credentials stored for a specific server."""
    if server_name not in AVAILABLE_MCP_SERVERS:
        raise HTTPException(status_code=404, detail=f"Unknown MCP server: {server_name}")

    user_id = str(current_user.id)
    stored = await get_user_credentials(user_id, server_name)

    return {
        "server_name": server_name,
        "status": "connected" if server_name in stored else "disconnected",
    }


@router.put(
    "/credentials/{server_name}",
    response_model=SaveCredentialResponse,
    summary="Save credentials for an MCP server",
)
async def save_credential(
    server_name: str,
    request: SaveCredentialRequest,
    current_user=Depends(get_current_user_from_request),
) -> SaveCredentialResponse:
    """Save credentials for a specific MCP server for the current user."""
    if server_name not in AVAILABLE_MCP_SERVERS:
        raise HTTPException(status_code=404, detail=f"Unknown MCP server: {server_name}")

    user_id = str(current_user.id)
    await save_user_credentials(user_id, server_name, request.credentials)

    return SaveCredentialResponse(server_name=server_name)


@router.delete(
    "/credentials/{server_name}",
    response_model=DeleteCredentialResponse,
    summary="Disconnect an MCP server",
)
async def delete_credential(
    server_name: str,
    current_user=Depends(get_current_user_from_request),
) -> DeleteCredentialResponse:
    """Remove stored credentials for an MCP server."""
    if server_name not in AVAILABLE_MCP_SERVERS:
        raise HTTPException(status_code=404, detail=f"Unknown MCP server: {server_name}")

    user_id = str(current_user.id)
    deleted = await delete_user_credentials(user_id, server_name)

    if not deleted:
        raise HTTPException(status_code=404, detail="No credentials found for this server")

    return DeleteCredentialResponse(server_name=server_name)
