"""GS transactions — always on the GS Mongo client."""
from __future__ import annotations

from gs.database.connection import get_gs_client


async def run_gs_transaction(operation):
    client = get_gs_client()
    async with await client.start_session() as session:
        return await session.with_transaction(operation)
