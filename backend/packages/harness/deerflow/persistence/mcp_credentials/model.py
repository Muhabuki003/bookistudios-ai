"""ORM model for per-user MCP credentials.

Each row stores a user's credentials for a specific MCP server (Notion, Figma, Google Workspace).
Credentials are stored as a JSON blob so each server type can store its own auth shape
(API keys, OAuth tokens, etc.) without schema changes.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from deerflow.persistence.base import Base


class UserMCPCredentialRow(Base):
    __tablename__ = "user_mcp_credentials"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Which user owns this credential
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)

    # Which MCP server this is for (e.g. "notion", "google-workspace", "figma")
    server_name: Mapped[str] = mapped_column(String(64), nullable=False)

    # JSON blob containing the credential payload.
    # Examples:
    #   Notion:      {"token": "ntn_xxx..."}
    #   Figma:       {"api_key": "figd_xxx..."}
    #   Google:      {"refresh_token": "xxx...", "client_id": "xxx...", "client_secret": "xxx..."}
    credentials: Mapped[str] = mapped_column(Text, nullable=False, default="{}")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    __table_args__ = (
        UniqueConstraint("user_id", "server_name", name="uq_user_mcp_server"),
    )
