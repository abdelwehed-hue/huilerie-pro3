"""Read-only client financial statements and consolidated invoice data."""
import re
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from lib.auth import require_admin
from lib.db import db
from lib.season import season_of

router = APIRouter(tags=["client-accounts"])


def _money(value):
    try:
        return round(float(value or 0), 3)
    except (TypeError, ValueError, OverflowError):
        return 0.0


def _dt(value):
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day, tzinfo=timezone.utc)
    if isinstance(value, str) and value:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            try:
                return datetime.fromisoformat(value[:10]).replace(tzinfo=timezone.utc)
            except ValueError:
                return None
    return None


def _iso(value):
    dt = _dt(value)
    return dt.isoformat() if dt else None


def _season_for_event(value, fallback_day=""):
    dt = _dt(value)
    if dt:
        return season_of(dt.date().isoformat())
    if fallback_day:
        return season_of(str(fallback_day)[:10])
    return ""


def _period(season="", start="", end=""):
    if season and season != "all":
        match = re.fullmatch(r"(\d{4})-(\d{4})", season)
        if not match or int(match.group(2)) != int(match.group(1)) + 1:
            raise HTTPException(422, "invalid_season")
        return date(int(match.group(1)), 10, 1), date(int(match.group(2)), 10, 1)
    if bool(start) != bool(end):
        raise HTTPException(422, "both_dates_required")
    if start and end:
        try:
            first, last = date.fromisoformat(start), date.fromisoformat(end)
        except ValueError:
            raise HTTPException(422, "invalid_date")
        if last < first:
            raise HTTPException(422, "invalid_date_range")
        return first, last + timedelta(days=1)
    return None, None


def _in_window(value, first, after_last):
    dt = _dt(value)
    if not dt:
        return False
    return (first is None or dt.date() >= first) and (after_last is None or dt.date() < after_last)


def _payment_events(invoice):
    """Use itemized payments when consistent; otherwise use paid_amount once as a legacy aggregate."""
    paid = _money(invoice.get("paid_amount"))
    raw = invoice.get("payments") or []
    parsed = []
    for item in raw:
        amount = _money(item.get("amount"))
        at = _dt(item.get("at"))
        if amount > 0 and at:
            parsed.append({"amount": amount, "at": at, "by": item.get("by", "")})
    itemized = round(sum(p["amount"] for p in parsed), 3)
    if parsed and itemized <= paid + 0.005:
        events = [{"amount": p["amount"], "at": p["at"], "by": p["by"], "legacy": False} for p in parsed]
        remainder = _money(max(0, paid - itemized))
        if remainder > 0.005:
            fallback_at = _dt(invoice.get("created_at")) or _dt(invoice.get("day"))
            if fallback_at:
                events.append({"amount": remainder, "at": fallback_at, "by": "", "legacy": True})
        return events
    if paid > 0:
        fallback_at = _dt(invoice.get("created_at")) or _dt(invoice.get("day"))
        if fallback_at:
            return [{"amount": paid, "at": fallback_at, "by": "", "legacy": True}]
    return []


@router.get("/client-accounts/search")
async def search_client_accounts(q: str = Query(min_length=2, max_length=120), _: dict = Depends(require_admin)):
    term = re.escape(q.strip())
    rx = {"$regex": term, "$options": "i"}
    matches = {}
    async for load in db.loads.find({"$or": [{"phone": rx}, {"client_name": rx}, {"code": rx}]},
                                    {"_id": 0, "phone": 1, "client_name": 1, "code": 1, "created_at": 1}).sort("created_at", -1).limit(500):
        phone = str(load.get("phone") or "").strip()
        if phone:
            entry = matches.setdefault(phone, {"phone": phone, "client_name": load.get("client_name", ""), "codes": set()})
            if load.get("code"):
                entry["codes"].add(str(load["code"]))
            if not entry["client_name"]:
                entry["client_name"] = load.get("client_name", "")
    async for invoice in db.invoices.find({"$or": [{"phone": rx}, {"client_name": rx}, {"load_code": rx}]},
                                          {"_id": 0, "phone": 1, "client_name": 1, "load_code": 1}).limit(300):
        phone = str(invoice.get("phone") or "").strip()
        if phone:
            entry = matches.setdefault(phone, {"phone": phone, "client_name": invoice.get("client_name", ""), "codes": set()})
            if invoice.get("load_code"):
                entry["codes"].add(str(invoice["load_code"]))
    async for client in db.clients.find({"$or": [{"phone": rx}, {"client_name": rx}]},
                                        {"_id": 0, "phone": 1, "client_name": 1}).limit(200):
        phone = str(client.get("phone") or "").strip()
        if phone:
            matches.setdefault(phone, {"phone": phone, "client_name": client.get("client_name", ""), "codes": set()})
    return [{"phone": item["phone"], "client_name": item["client_name"],
             "codes": sorted(item["codes"])} for item in list(matches.values())[:50]]


@router.get("/client-accounts/{phone}")
async def client_account_statement(
    phone: str,
    season: str = "all",
    start: str = "",
    end: str = "",
    _: dict = Depends(require_admin),
):
    phone = phone.strip()
    if not phone:
        raise HTTPException(422, "phone_required")
    first, after_last = _period(season, start, end)
    loads = await db.loads.find({"phone": phone}, {"_id": 0}).sort("day", 1).to_list(10000)
    if not loads:
        client = await db.clients.find_one({"phone": phone}, {"_id": 0})
        if not client:
            raise HTTPException(404, "client_not_found")
    load_by_id = {item.get("id"): item for item in loads if item.get("id")}
    load_ids = list(load_by_id)
    invoice_filter = {"$or": [{"phone": phone}, {"load_id": {"$in": load_ids}}]} if load_ids else {"phone": phone}
    invoices = await db.invoices.find(invoice_filter, {"_id": 0}).sort("created_at", 1).to_list(10000)
    for invoice in invoices:
        load = load_by_id.get(invoice.get("load_id"))
        if load:
            invoice["_load"] = load

    def load_season(load):
        return str(load.get("season_id") or season_of(str(load.get("day") or "")[:10]))

    def in_scope_load(load):
        if season and season != "all":
            return load_season(load) == season
        return _in_window(load.get("day"), first, after_last)

    global_loads = []
    selected_loads = [item for item in loads if in_scope_load(item)]
    invoice_by_load = {item.get("load_id"): item for item in invoices}
    global_total = global_paid = global_balance = 0.0
    for load in selected_loads:
        invoice = invoice_by_load.get(load.get("id"))
        cancelled = load.get("cancelled") is True
        if invoice:
            total = _money(invoice.get("total"))
            paid = _money(invoice.get("paid_amount"))
            balance = _money(invoice.get("balance", max(0, total - paid)))
            global_total += total
            global_paid += paid
            global_balance += balance
        else:
            total = paid = balance = 0.0
        global_loads.append({
            "day": load.get("day", ""), "code": load.get("code", ""),
            "client_name": load.get("client_name", ""), "olive_kg": _money(load.get("olive_kg")),
            "oil_kg": _money(load.get("oil_kg")), "invoice_number": invoice.get("number") if invoice else None,
            "total": total, "paid": paid, "balance": balance, "cancelled": cancelled,
            "cancel_reason": load.get("cancel_reason", ""), "cancelled_at": _iso(load.get("cancelled_at")),
            "has_invoice": bool(invoice),
        })

    # Build the complete client ledger first so opening balance includes prior seasons/periods.
    ledger = []
    for invoice in invoices:
        load = invoice.get("_load") or {}
        inv_date = _dt(invoice.get("created_at")) or _dt(invoice.get("day"))
        if inv_date:
            ledger.append({
                "id": "invoice:" + str(invoice.get("id", invoice.get("number", ""))),
                "date": inv_date.isoformat(), "kind": "invoice", "label": "Facture " + str(invoice.get("number", "")),
                "debit": _money(invoice.get("total")), "credit": 0.0,
                "load_code": invoice.get("load_code", ""), "season": _season_for_event(inv_date, load.get("day", invoice.get("day", ""))),
                "informational": False,
            })
        for index, payment in enumerate(_payment_events(invoice)):
            pay_date = payment["at"]
            ledger.append({
                "id": f"payment:{invoice.get('id', '')}:{index}", "date": pay_date.isoformat(),
                "kind": "payment", "label": "Paiement facture " + str(invoice.get("number", "")),
                "debit": 0.0, "credit": _money(payment["amount"]), "load_code": invoice.get("load_code", ""),
                "season": _season_for_event(pay_date), "informational": False,
                "legacy_aggregate": payment.get("legacy", False),
            })
    for load in loads:
        if load.get("cancelled") and load.get("cancelled_at"):
            cancel_date = _dt(load.get("cancelled_at"))
            if cancel_date:
                ledger.append({
                    "id": "cancel:" + str(load.get("id", "")), "date": cancel_date.isoformat(),
                    "kind": "cancellation", "label": "Annulation " + str(load.get("code", "")),
                    "debit": 0.0, "credit": 0.0, "load_code": load.get("code", ""),
                    "season": _season_for_event(cancel_date), "informational": True,
                    "reason": load.get("cancel_reason", ""),
                })

    ledger.sort(key=lambda event: (event["date"], event["id"]))
    if first is not None:
        start_dt = datetime(first.year, first.month, first.day, tzinfo=timezone.utc)
        end_dt = datetime(after_last.year, after_last.month, after_last.day, tzinfo=timezone.utc)
    else:
        start_dt = end_dt = None

    opening = 0.0
    visible = []
    for event in ledger:
        event_dt = _dt(event["date"])
        if start_dt and event_dt < start_dt:
            opening += event["credit"] - event["debit"]
            continue
        if start_dt and event_dt >= end_dt:
            continue
        if season and season != "all" and event.get("season") != season:
            continue
        visible.append(event)
    debit_total = round(sum(item["debit"] for item in visible), 3)
    credit_total = round(sum(item["credit"] for item in visible), 3)
    final_balance = round(opening + credit_total - debit_total, 3)

    settings = await db.settings.find_one({"key": "app"}, {"_id": 0, "mill_name": 1, "mill_address": 1, "mill_phone": 1, "mill_logo": 1}) or {}
    name = (loads[-1].get("client_name") if loads else None) or (invoices[-1].get("client_name") if invoices else None) or (client.get("client_name") if not loads else "")
    return {
        "client": {"phone": phone, "client_name": name},
        "period": {"season": season, "start": first.isoformat() if first else start, "end": (after_last - timedelta(days=1)).isoformat() if after_last else end},
        "seasons": sorted({load_season(item) for item in loads if item.get("day")}, reverse=True),
        "global_invoice": {
            "loads": global_loads, "total": round(global_total, 3), "paid": round(global_paid, 3),
            "balance": round(global_balance, 3),
        },
        "statement": {
            "opening_balance": round(opening, 3), "debit_total": debit_total,
            "credit_total": credit_total, "final_balance": final_balance, "transactions": visible,
        },
        "mill": settings,
    }
