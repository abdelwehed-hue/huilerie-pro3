"""Pickup reminders: one SMS when oil has been ready for REMINDER_HOURS (default 48) without delivery."""

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone

from lib.db import db
from lib.sms import send_load_sms

log = logging.getLogger(__name__)


def _hours() -> float:
    return float(os.environ.get("REMINDER_HOURS", "48"))


async def run_reminders() -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=_hours())
    flt = {
        "oil_kg": {"$ne": None}, "oil_ready_at": {"$lte": cutoff},
        "delivered": {"$ne": True}, "cancelled": {"$ne": True}, "reminder_sent_at": None,
    }
    sent = 0
    async for doc in db.loads.find(flt, {"_id": 0}):
        # claim first so a concurrent run never double-sends
        res = await db.loads.update_one({"id": doc["id"], "reminder_sent_at": None},
                                        {"$set": {"reminder_sent_at": datetime.now(timezone.utc)}})
        if res.modified_count:
            await send_load_sms(doc, "reminder")
            sent += 1
    return sent


async def reminder_loop() -> None:
    interval = float(os.environ.get("REMINDER_CHECK_MINUTES", "30")) * 60
    while True:
        try:
            n = await run_reminders()
            if n:
                log.info("pickup reminders sent: %s", n)
        except Exception:  # keep the loop alive
            log.exception("reminder run failed")
        await asyncio.sleep(interval)
