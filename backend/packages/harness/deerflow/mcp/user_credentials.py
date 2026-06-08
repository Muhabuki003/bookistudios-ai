"""Per-user MCP credential storage and retrieval.

Stores encrypted credentials per user per MCP server in the shared database.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from deerflow.persistence.engine import get_session_factory
from deerflow.persistence.mcp_credentials.model import UserMCPCredentialRow

logger = logging.getLogger(__name__)


async def get_user_credentials(
    user_id: str,
    server_name: str | None = None,
) -> dict[str, dict]:
    """Get stored credentials for a user.

    Args:
        user_id: The user's UUID.
        server_name: Optional server name to filter by. If None, returns all.

    Returns:
        Dict of {server_name: parsed_creds_dict} or {} if none found.
    """
    sf = get_session_factory()
    if sf is None:
        return {}

    async with sf() as session:
        stmt = select(UserMCPCredentialRow).where(
            UserMCPCredentialRow.user_id == user_id
        )
        if server_name:
            stmt = stmt.where(UserMCPCredentialRow.server_name == server_name)

        result = await session.execute(stmt)
        rows = result.scalars().all()

        return {
            row.server_name: json.loads(row.credentials)
            for row in rows
        }


async def save_user_credentials(
    user_id: str,
    server_name: str,
    credentials: dict,
) -> bool:
    """Save or update credentials for a user + server.

    Args:
        user_id: The user's UUID.
        server_name: MCP server name (e.g. 'notion', 'figma', 'google-workspace').
        credentials: Dict of credential values to store.

    Returns:
        True if saved successfully.
    """
    sf = get_session_factory()
    if sf is None:
        raise RuntimeError("Database not available")

    async with sf() as session:
        stmt = select(UserMCPCredentialRow).where(
            UserMCPCredentialRow.user_id == user_id,
            UserMCPCredentialRow.server_name == server_name,
        )
        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()

        now = datetime.now(UTC)

        if existing:
            existing.credentials = json.dumps(credentials)
            existing.updated_at = now
        else:
            row = UserMCPCredentialRow(
                user_id=user_id,
                server_name=server_name,
                credentials=json.dumps(credentials),
                created_at=now,
                updated_at=now,
            )
            session.add(row)

        await session.commit()
        logger.info(
            "Saved MCP credentials for user=%s server=%s",
            user_id[:8],
            server_name,
        )
        return True


async def delete_user_credentials(
    user_id: str,
    server_name: str,
) -> bool:
    """Delete stored credentials for a user + server.

    Args:
        user_id: The user's UUID.
        server_name: MCP server name.

    Returns:
        True if deleted, False if not found.
    """
    sf = get_session_factory()
    if sf is None:
        return False

    async with sf() as session:
        stmt = select(UserMCPCredentialRow).where(
            UserMCPCredentialRow.user_id == user_id,
            UserMCPCredentialRow.server_name == server_name,
        )
        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()

        if not existing:
            return False

        await session.delete(existing)
        await session.commit()
        logger.info(
            "Deleted MCP credentials for user=%s server=%s",
            user_id[:8],
            server_name,
        )
        return True
