"""SMS sender. MOCKED: no provider configured yet — every message is logged in `sms_log`
with status "simulated". Plug a real provider (e.g. Twilio) into `_deliver` later."""

import uuid
from datetime import datetime, timezone

from lib.db import db


def _fmt(n: float) -> str:
    return f"{n:g}"


async def _deliver(phone: str, message: str) -> str:
    return "simulated"


async def send_load_sms(load: dict, kind: str) -> dict:
    s = await db.settings.find_one({"key": "app"}) or {}
    mill = s.get("mill_name") or "Huilerie Pro"
    name, code = load["client_name"], load["code"]
    if kind == "arrival":
        msg = (
            f"{mill}: Bonjour {name}, votre code: {code} - Olives: {_fmt(load['olive_kg'])} kg.\n"
            f"{mill}: مرحبا {name}، الكود متاعك: {code} - الزيتون: {_fmt(load['olive_kg'])} كغ."
        )
    else:
        msg = (
            f"{mill}: {name}, votre huile est prête: {_fmt(load['oil_kg'])} kg (code {code}).\n"
            f"{mill}: {name}، الزيت متاعك جاهز: {_fmt(load['oil_kg'])} كغ (الكود {code})."
        )
    doc = {
        "id": str(uuid.uuid4()), "load_id": load["id"], "code": code, "client_name": name,
        "phone": load["phone"], "kind": kind, "message": msg,
        "status": await _deliver(load["phone"], msg), "created_at": datetime.now(timezone.utc),
    }
    await db.sms_log.insert_one(doc)
    doc.pop("_id", None)
    return doc
