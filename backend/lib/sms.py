"""SMS sender.

Live mode via Twilio Messages API when TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN and a sender
(TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID) are set in backend/.env.
Otherwise MOCKED: messages are only logged in `sms_log` with status "simulated".
"""

import logging
import os
import re
import uuid
from datetime import datetime, timezone

import httpx

from lib.db import db
from models.schemas import DEFAULT_SMS_ARRIVAL, DEFAULT_SMS_READY

log = logging.getLogger(__name__)


def _env(k: str) -> str:
    return os.environ.get(k, "").strip()


def sms_mode() -> str:
    sid, token = _env("TWILIO_ACCOUNT_SID"), _env("TWILIO_AUTH_TOKEN")
    sender = _env("TWILIO_FROM_NUMBER") or _env("TWILIO_MESSAGING_SERVICE_SID")
    return "live" if sid and token and sender else "simulated"


def to_e164(phone: str) -> str:
    raw = phone.strip()
    digits = re.sub(r"\D", "", raw)
    cc = _env("SMS_COUNTRY_CODE") or "216"
    if raw.startswith("+"):
        return "+" + digits
    if digits.startswith("00"):
        return "+" + digits[2:]
    if len(digits) == 8:
        return f"+{cc}{digits}"
    return "+" + digits


class _Safe(dict):
    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


def _fmt(n) -> str:
    return "" if n is None else f"{n:g}"


def render(template: str, values: dict, fallback: str) -> str:
    try:
        return template.format_map(_Safe(values))
    except (ValueError, IndexError):
        return fallback.format_map(_Safe(values))


async def _deliver(to: str, message: str) -> tuple[str, str | None]:
    if sms_mode() != "live":
        return "simulated", None
    sid, token = _env("TWILIO_ACCOUNT_SID"), _env("TWILIO_AUTH_TOKEN")
    data = {"To": to, "Body": message}
    if _env("TWILIO_MESSAGING_SERVICE_SID"):
        data["MessagingServiceSid"] = _env("TWILIO_MESSAGING_SERVICE_SID")
    else:
        data["From"] = _env("TWILIO_FROM_NUMBER")
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.post(f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
                             auth=(sid, token), data=data)
        if r.status_code in (200, 201):
            return "sent", None
        try:
            err = r.json().get("message") or r.text
        except ValueError:
            err = r.text
        return "failed", f"{r.status_code}: {err}"[:300]
    except httpx.HTTPError as e:
        log.warning("twilio send failed: %s", e)
        return "failed", str(e)[:300]


async def send_load_sms(load: dict, kind: str) -> dict:
    s = await db.settings.find_one({"key": "app"}) or {}
    values = {
        "mill": s.get("mill_name") or "Huilerie Pro", "name": load["client_name"], "code": load["code"],
        "olive_kg": _fmt(load.get("olive_kg")), "oil_kg": _fmt(load.get("oil_kg")),
    }
    if kind == "arrival":
        msg = render(s.get("sms_arrival_template") or DEFAULT_SMS_ARRIVAL, values, DEFAULT_SMS_ARRIVAL)
    else:
        msg = render(s.get("sms_ready_template") or DEFAULT_SMS_READY, values, DEFAULT_SMS_READY)
    to = to_e164(load["phone"])
    if s.get("sms_enabled", True):
        status, error = await _deliver(to, msg)
    else:
        status, error = "disabled", None
    doc = {
        "id": str(uuid.uuid4()), "load_id": load["id"], "code": load["code"], "client_name": load["client_name"],
        "phone": load["phone"], "to_number": to, "kind": kind, "message": msg,
        "status": status, "error": error, "created_at": datetime.now(timezone.utc),
    }
    await db.sms_log.insert_one(doc)
    doc.pop("_id", None)
    return doc
