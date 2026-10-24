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
from lib.season import active_season
from models.schemas import DEFAULT_SMS_ARRIVAL, DEFAULT_SMS_READY, DEFAULT_SMS_REMINDER

log = logging.getLogger(__name__)
API = "https://api.twilio.com/2010-04-01"


def _env(k: str) -> str:
    return os.environ.get(k, "").strip()


async def get_creds() -> dict:
    """Admin-entered credentials (settings key "twilio") win; falls back to backend/.env."""
    doc = await db.settings.find_one({"key": "twilio"}, {"_id": 0}) or {}
    if doc.get("account_sid"):
        return {"sid": doc["account_sid"], "token": doc.get("auth_token", ""),
                "from": doc.get("from_number", ""), "mss": doc.get("messaging_service_sid", ""), "source": "db"}
    if _env("TWILIO_ACCOUNT_SID"):
        return {"sid": _env("TWILIO_ACCOUNT_SID"), "token": _env("TWILIO_AUTH_TOKEN"),
                "from": _env("TWILIO_FROM_NUMBER"), "mss": _env("TWILIO_MESSAGING_SERVICE_SID"), "source": "env"}
    return {"sid": "", "token": "", "from": "", "mss": "", "source": "none"}


def _is_live(c: dict) -> bool:
    return bool(c["sid"] and c["token"] and (c["from"] or c["mss"]))


async def sms_mode() -> str:
    return "live" if _is_live(await get_creds()) else "simulated"


async def verify_twilio(sid: str, token: str) -> bool:
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(f"{API}/Accounts/{sid}.json", auth=(sid, token))
    return r.status_code == 200


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
    c = await get_creds()
    if not _is_live(c):
        return "simulated", None
    sid, token = c["sid"], c["token"]
    data = {"To": to, "Body": message}
    if c["mss"]:
        data["MessagingServiceSid"] = c["mss"]
    else:
        data["From"] = c["from"]
    try:
        async with httpx.AsyncClient(timeout=10) as cl:
            r = await cl.post(f"{API}/Accounts/{sid}/Messages.json", auth=(sid, token), data=data)
        if r.status_code in (200, 201):
            return "sent", None
        try:
            j = r.json()
            err = f"[{j.get('code')}] {j.get('message')}" if j.get("code") else (j.get("message") or r.text)
        except ValueError:
            err = r.text
        return "failed", f"{r.status_code}: {err}"[:300]
    except httpx.HTTPError as e:
        log.warning("twilio send failed: %s", e)
        return "failed", str(e)[:300]


async def _log(doc: dict) -> dict:
    doc = {"id": str(uuid.uuid4()), "created_at": datetime.now(timezone.utc), **doc}
    await db.sms_log.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def send_test(phone: str) -> dict:
    s = await db.settings.find_one({"key": "app"}) or {}
    mill = s.get("mill_name") or "Huilerie Pro"
    msg = f"{mill}: message de test / رسالة تجريبية"
    to = to_e164(phone)
    status, error = await _deliver(to, msg)
    return await _log({"season_id": await active_season(), "load_id": "", "code": "TEST", "client_name": "Test", "phone": phone, "to_number": to,
                       "kind": "test", "message": msg, "status": status, "error": error})


TEMPLATES = {
    "arrival": ("sms_arrival_template", DEFAULT_SMS_ARRIVAL),
    "ready": ("sms_ready_template", DEFAULT_SMS_READY),
    "reminder": ("sms_reminder_template", DEFAULT_SMS_REMINDER),
}


async def send_load_sms(load: dict, kind: str) -> dict:
    s = await db.settings.find_one({"key": "app"}) or {}
    values = {
        "mill": s.get("mill_name") or "Huilerie Pro", "name": load["client_name"], "code": load["code"],
        "olive_kg": _fmt(load.get("olive_kg")), "oil_kg": _fmt(load.get("oil_kg")),
    }
    key, default = TEMPLATES[kind]
    msg = render(s.get(key) or default, values, default)
    to = to_e164(load["phone"])
    if s.get("sms_enabled", True):
        status, error = await _deliver(to, msg)
    else:
        status, error = "disabled", None
    return await _log({
        "load_id": load["id"], "code": load["code"], "client_name": load["client_name"],
        "season_id": load.get("season_id") or await active_season(),
        "phone": load["phone"], "to_number": to, "kind": kind, "message": msg,
        "status": status, "error": error,
    })
