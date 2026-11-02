"""SMS log, revenue + per-worker reports (JSON / Excel / PDF, bilingual FR+AR), client history, lab certificates."""

import io
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from lib.auth import current_user, require_admin
from lib.dates import today_iso
from lib.db import db, run_transaction
from lib.reminders import run_reminders
from lib.season import season_filter
from lib.sms import get_creds, send_test, sms_mode, verify_twilio
from lib.phone import is_valid_tunisie_sms_phone, normalize_tunisie_sms_phone
from models.schemas import (
    ReminderRunResult, SmsTestIn, SmsTestResult, TwilioConfigIn, TwilioConfigOut, ClientUpdate, ClientDeleteResult, ClientCreate,
    Certificate, ClientHistory, ClientSummary, LabAnalysis, MillInfo, ReportRow,
    RevenueReport, SmsLog, SmsStatus, WorkerReport, WorkerRow,
)
from routers.loads import _labs_for, to_load

router = APIRouter(tags=["extras"])
FONTS = Path(__file__).resolve().parent.parent / "fonts"


def _tn_money(value: float | int | None) -> str:
    """Format Tunisian dinars as grouped dinars, comma, and three millimes digits."""
    return f"{float(value or 0):,.3f}".replace(",", "\u202f").replace(".", ",")


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


async def _mill() -> MillInfo:
    s = await db.settings.find_one({"key": "app"}) or {}
    return MillInfo(mill_name=s.get("mill_name", ""), mill_address=s.get("mill_address", ""),
                    mill_phone=s.get("mill_phone", ""), mill_logo=s.get("mill_logo", ""))


@router.get("/mill", response_model=MillInfo)
async def mill_info(_: dict = Depends(current_user)):
    return await _mill()


# ---------- SMS ----------
@router.get("/sms", response_model=list[SmsLog])
async def list_sms(_: dict = Depends(current_user)):
    docs = await db.sms_log.find(await season_filter(), {"_id": 0}).sort("created_at", -1).to_list(300)
    return [SmsLog(**{**d, "created_at": _aware(d["created_at"])}) for d in docs]


@router.delete("/sms/{sms_id}")
async def delete_sms(sms_id: str, _: dict = Depends(require_admin)):
    result = await db.sms_log.delete_one({"id": sms_id, **(await season_filter())})
    if not result.deleted_count:
        raise HTTPException(404, "sms_not_found")
    return {"deleted": True, "id": sms_id}


@router.get("/sms/status", response_model=SmsStatus)
async def sms_status(_: dict = Depends(current_user)):
    s = await db.settings.find_one({"key": "app"}) or {}
    return SmsStatus(mode=await sms_mode(), enabled=s.get("sms_enabled", True))


async def _twilio_out() -> TwilioConfigOut:
    c = await get_creds()
    return TwilioConfigOut(account_sid=c["sid"], from_number=c["from"], messaging_service_sid=c["mss"],
                           has_token=bool(c["token"]), source=c["source"], mode=await sms_mode())


@router.get("/sms/twilio", response_model=TwilioConfigOut)
async def get_twilio(_: dict = Depends(require_admin)):
    return await _twilio_out()


@router.put("/sms/twilio", response_model=TwilioConfigOut)
async def put_twilio(body: TwilioConfigIn, _: dict = Depends(require_admin)):
    sid = body.account_sid.strip()
    if not sid.startswith("AC"):
        raise HTTPException(400, "twilio_bad_sid")
    if not (body.from_number.strip() or body.messaging_service_sid.strip()):
        raise HTTPException(400, "twilio_sender_required")
    stored = await db.settings.find_one({"key": "twilio"}) or {}
    token = body.auth_token.strip() or (stored.get("auth_token", "") if stored.get("account_sid") == sid else "")
    if not token:
        raise HTTPException(400, "twilio_token_required")
    try:
        ok = await verify_twilio(sid, token)
    except httpx.HTTPError:
        raise HTTPException(502, "twilio_unreachable")
    if not ok:
        raise HTTPException(400, "twilio_invalid_credentials")
    await db.settings.update_one({"key": "twilio"}, {"$set": {
        "account_sid": sid, "auth_token": token, "from_number": body.from_number.strip(),
        "messaging_service_sid": body.messaging_service_sid.strip(),
    }}, upsert=True)
    return await _twilio_out()


@router.delete("/sms/twilio", response_model=TwilioConfigOut)
async def delete_twilio(_: dict = Depends(require_admin)):
    await db.settings.delete_one({"key": "twilio"})
    return await _twilio_out()


@router.get("/sms/tunisie")
async def get_tunisie_sms(_: dict = Depends(require_admin)):
    c = await db.settings.find_one({"key": "tunisie_sms"}) or {}
    return {
        "account_id": c.get("account_id", ""),
        "api_key": "",
        "has_api_key": bool(c.get("api_key")),
        "sender": c.get("sender", ""),
        "api_url": c.get("api_url", ""),
    }


@router.put("/sms/tunisie")
async def put_tunisie_sms(body: dict, _: dict = Depends(require_admin)):
    # Store credentials for later setup only; do not change the active Twilio sender.
    old = await db.settings.find_one({"key": "tunisie_sms"}) or {}
    api_key = str(body.get("api_key", "")).strip() or old.get("api_key", "")
    await db.settings.update_one({"key": "tunisie_sms"}, {"$set": {
        "account_id": str(body.get("account_id", "")).strip(),
        "api_key": api_key,
        "sender": str(body.get("sender", "")).strip(),
        "api_url": str(body.get("api_url", "")).strip(),
    }}, upsert=True)
    return {
        "account_id": str(body.get("account_id", "")).strip(),
        "api_key": "",
        "has_api_key": bool(api_key),
        "sender": str(body.get("sender", "")).strip(),
        "api_url": str(body.get("api_url", "")).strip(),
    }


@router.post("/sms/tunisie/test")
async def tunisie_sms_test(body: dict, _: dict = Depends(require_admin)):
    """Send a one-off test using the configured TunisieSMS endpoint and credentials."""
    phone = normalize_tunisie_sms_phone(body.get("phone", ""))
    if not is_valid_tunisie_sms_phone(phone):
        raise HTTPException(400, "invalid_test_phone")

    cfg = await db.settings.find_one({"key": "tunisie_sms"}) or {}
    api_url = str(cfg.get("api_url", "")).strip()
    account_id = str(cfg.get("account_id", "")).strip()
    api_key = str(cfg.get("api_key", "")).strip()
    sender = str(cfg.get("sender", "")).strip()
    if not api_url or not account_id or not api_key or not sender:
        raise HTTPException(400, "tunisie_sms_settings_incomplete")
    if not api_url.startswith(("https://", "http://")):
        raise HTTPException(400, "tunisie_sms_invalid_api_url")

    # Generic JSON request; adapt the field names if your TunisieSMS account's API
    # documentation specifies a different request format.
    payload = {
        "account_id": account_id,
        "api_key": api_key,
        "sender": sender,
        "to": phone,
        "message": "SMS de test - Huilerie Pro / TunisieSMS",
    }
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=False) as client:
            response = await client.post(api_url, json=payload)
    except httpx.HTTPError:
        raise HTTPException(502, "tunisie_sms_api_unreachable")

    if not response.is_success:
        raise HTTPException(502, f"tunisie_sms_api_error_{response.status_code}")
    return {"status": "submitted", "to_number": phone, "message": "La requête a été acceptée par l’API TunisieSMS."}


@router.post("/sms/test", response_model=SmsTestResult)
async def sms_test(body: SmsTestIn, _: dict = Depends(require_admin)):
    d = await send_test(body.phone)
    return SmsTestResult(status=d["status"], error=d.get("error"), to_number=d["to_number"], mode=await sms_mode())


@router.post("/sms/reminders/run", response_model=ReminderRunResult)
async def sms_reminders_run(_: dict = Depends(require_admin)):
    return ReminderRunResult(sent=await run_reminders())


# ---------- Reports ----------
def _range(period: str, start: str | None, end: str | None) -> tuple[str, str]:
    end = end or today_iso()
    if not start:
        e = datetime.strptime(end, "%Y-%m-%d")
        start = (e - timedelta(days=29)).strftime("%Y-%m-%d") if period == "daily" else f"{e.year}-01-01"
    return start, end


async def build_report(period: str, start: str | None, end: str | None, worker: str = "") -> RevenueReport:
    start, end = _range(period, start, end)
    flt: dict = {"day": {"$gte": start, "$lte": end}, "cancelled": {"$ne": True}, **(await season_filter())}
    if worker:
        flt["created_by"] = worker
    docs = await db.loads.find(flt, {"_id": 0}).to_list(100000)
    # Operational quantities follow the load date. Revenue follows cash
    # actually received: sum every payment event (including partial payments)
    # on the date it was recorded, never the invoice's full billed total.
    agg: dict[str, list[float]] = {}
    load_ids: list[str] = []
    for d in docs:
        key = d["day"] if period == "daily" else d["day"][:7]
        a = agg.setdefault(key, [0, 0.0, 0.0, 0.0])
        a[0] += 1
        a[1] += d["olive_kg"]
        a[2] += d.get("oil_kg") or 0.0
        load_ids.append(d["id"])

    # Include invoices for eligible loads from earlier dates too: a payment
    # received today belongs to today's cash revenue even if its load is older.
    payment_load_filter = {"cancelled": {"$ne": True}, **(await season_filter())}
    if worker:
        payment_load_filter["created_by"] = worker
    payment_load_ids = await db.loads.distinct("id", payment_load_filter)
    if payment_load_ids:
        invoice_query = {"load_id": {"$in": payment_load_ids}}
        projection = {"_id": 0, "payments": 1, "paid_amount": 1, "created_at": 1}
        async for invoice in db.invoices.find(invoice_query, projection):
            payments = invoice.get("payments") or []
            if payments:
                for payment in payments:
                    amount = float(payment.get("amount") or 0.0)
                    at = payment.get("at")
                    if amount <= 0 or at is None:
                        continue
                    if isinstance(at, str):
                        try:
                            at = datetime.fromisoformat(at.replace("Z", "+00:00"))
                        except ValueError:
                            continue
                    if isinstance(at, datetime):
                        day = _aware(at).strftime("%Y-%m-%d")
                        if start <= day <= end:
                            key = day if period == "daily" else day[:7]
                            agg.setdefault(key, [0, 0.0, 0.0, 0.0])[3] += amount
            else:
                # Legacy compatibility: invoices created before payment events
                # were stored use paid_amount and their creation date.
                amount = float(invoice.get("paid_amount") or 0.0)
                at = invoice.get("created_at")
                if amount > 0 and at is not None:
                    if isinstance(at, str):
                        try:
                            at = datetime.fromisoformat(at.replace("Z", "+00:00"))
                        except ValueError:
                            at = None
                    if isinstance(at, datetime):
                        day = _aware(at).strftime("%Y-%m-%d")
                        if start <= day <= end:
                            key = day if period == "daily" else day[:7]
                            agg.setdefault(key, [0, 0.0, 0.0, 0.0])[3] += amount
    rows = [
        ReportRow(period=k, loads=int(v[0]), olive_kg=round(v[1], 2), oil_kg=round(v[2], 2), revenue=round(v[3], 3))
        for k, v in sorted(agg.items())
    ]
    total = ReportRow(
        period="TOTAL", loads=sum(r.loads for r in rows), olive_kg=round(sum(r.olive_kg for r in rows), 2),
        oil_kg=round(sum(r.oil_kg for r in rows), 2), revenue=round(sum(r.revenue for r in rows), 3),
    )
    return RevenueReport(period=period, start=start, end=end, rows=rows, total=total)


async def build_worker_report(period: str, start: str | None, end: str | None, worker: str = "") -> WorkerReport:
    """Loads are credited to the worker who registered the arrival (created_by)."""
    start, end = _range(period, start, end)
    flt: dict = {"day": {"$gte": start, "$lte": end}, "cancelled": {"$ne": True}, **(await season_filter())}
    if worker:
        flt["created_by"] = worker
    docs = await db.loads.find(flt, {"_id": 0}).to_list(100000)
    names = {u["username"]: u["full_name"] async for u in db.users.find({}, {"_id": 0, "username": 1, "full_name": 1})}
    per: dict[tuple[str, str], list[float]] = {}
    tot: dict[str, list[float]] = {}
    for d in docs:
        rev = d["olive_kg"] * d.get("price_per_kg", 0)
        for bucket, key in ((per, (d["day"], d["created_by"])), (tot, d["created_by"])):
            a = bucket.setdefault(key, [0, 0.0, 0.0, 0.0])
            a[0] += 1; a[1] += d["olive_kg"]; a[2] += d.get("oil_kg") or 0.0; a[3] += rev

    def row(day: str, u: str, a: list[float]) -> WorkerRow:
        return WorkerRow(day=day, username=u, full_name=names.get(u, u), loads=int(a[0]),
                         olive_kg=round(a[1], 2), oil_kg=round(a[2], 2), revenue=round(a[3], 3))

    rows = [row(day, u, a) for (day, u), a in sorted(per.items(), key=lambda x: (x[0][0], x[0][1]), reverse=True)]
    totals = sorted((row("TOTAL", u, a) for u, a in tot.items()), key=lambda r: -r.revenue)
    return WorkerReport(start=start, end=end, rows=rows, totals=totals)


PeriodQ = Query("daily", pattern="^(daily|monthly)$")


@router.get("/reports/revenue", response_model=RevenueReport)
async def revenue_report(period: str = PeriodQ, start: str | None = None, end: str | None = None,
                         worker: str = "", _: dict = Depends(require_admin)):
    return await build_report(period, start, end, worker)


@router.get("/reports/workers", response_model=WorkerReport)
async def worker_report(period: str = PeriodQ, start: str | None = None, end: str | None = None,
                        worker: str = "", _: dict = Depends(require_admin)):
    return await build_worker_report(period, start, end, worker)


HEAD_FR = ["Période", "Chargements", "Olives (kg)", "Huile (Li)", "Recettes (DT)"]
HEAD_AR = ["الفترة", "الحمولات", "الزيتون (كغ)", "الزيت (لتر)", "المداخيل (د.ت)"]
WHEAD_FR = ["Date", "Ouvrier", "Chargements", "Olives (kg)", "Huile (Li)", "Recettes (DT)"]
WHEAD_AR = ["التاريخ", "العامل", "الحمولات", "الزيتون (كغ)", "الزيت (لتر)", "المداخيل (د.ت)"]


def _titles(period: str) -> tuple[str, str]:
    return (
        "Rapport des recettes périodique",
        "تقرير المداخيل الدوري",
    )


@router.get("/reports/revenue.xlsx")
async def revenue_xlsx(period: str = PeriodQ, start: str | None = None, end: str | None = None,
                       worker: str = "", _: dict = Depends(require_admin)):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    rep = await build_report(period, start, end, worker)
    wrep = await build_worker_report(period, start, end, worker)
    invoice_docs = await db.invoices.find({"day": {"$gte": rep.start, "$lte": rep.end}}, {"_id": 0, "total": 1, "paid_amount": 1, "balance": 1}).to_list(100000)
    invoice_totals = {
        "total": round(sum(float(i.get("total") or 0) for i in invoice_docs), 3),
        "paid": round(sum(float(i.get("paid_amount") or 0) for i in invoice_docs), 3),
        "balance": round(sum(float(i.get("balance") or 0) for i in invoice_docs), 3),
    }
    mill = (await _mill()).mill_name or "Huilerie Pro"
    t_fr, t_ar = _titles(period)
    wb = Workbook()

    def header(ws, *rows):
        for r in rows:
            ws.append(r)
            for c in ws[ws.max_row]:
                c.font = Font(bold=True, color="FFFFFF")
                c.fill = PatternFill("solid", fgColor="3F6212")

    ws = wb.active
    ws.title = "Recettes - المداخيل"
    ws.append([f"{mill} — {t_fr} / {t_ar}"])
    ws["A1"].font = Font(bold=True, size=14)
    ws.append([f"Du {rep.start} au {rep.end} — من {rep.start} إلى {rep.end}"])
    ws.append([])
    header(ws, HEAD_FR, HEAD_AR)
    for r in rep.rows + [rep.total]:
        ws.append([r.period if r.period != "TOTAL" else "TOTAL / المجموع", r.loads, r.olive_kg, r.oil_kg, r.revenue])
    for c in ws[ws.max_row]:
        c.font = Font(bold=True)
    for row in ws.iter_rows(min_row=6, min_col=5, max_col=5):
        row[0].number_format = "#,##0.000"
    for col, w in zip("ABCDE", [20, 14, 16, 14, 18]):
        ws.column_dimensions[col].width = w

    ws2 = wb.create_sheet("Ouvriers - العمال")
    ws2.append([f"{mill} — Recettes par ouvrier / المداخيل حسب العامل"])
    ws2["A1"].font = Font(bold=True, size=14)
    ws2.append([])
    header(ws2, WHEAD_FR, WHEAD_AR)
    for r in wrep.rows:
        ws2.append([r.day, r.full_name, r.loads, r.olive_kg, r.oil_kg, r.revenue])
    for r in wrep.totals:
        ws2.append(["TOTAL / المجموع", r.full_name, r.loads, r.olive_kg, r.oil_kg, r.revenue])
        for c in ws2[ws2.max_row]:
            c.font = Font(bold=True)
    invoice_summary = [
        ["Total des factures", invoice_totals["total"]],
        ["Montant payé", invoice_totals["paid"]],
        ["Reste à payer", invoice_totals["balance"]],
    ]
    ws2.append([])
    for label, amount in invoice_summary:
        ws2.append([label, "", "", "", "", amount])
        row_num = ws2.max_row
        ws2.merge_cells(start_row=row_num, start_column=1, end_row=row_num, end_column=5)
        for cell in ws2[row_num]:
            cell.font = Font(bold=True)
    for row in ws2.iter_rows(min_row=5, min_col=6, max_col=6):
        if isinstance(row[0].value, (int, float)):
            row[0].number_format = "#,##0.000"
    for col, w in zip("ABCDEF", [20, 22, 14, 16, 14, 25]):
        ws2.column_dimensions[col].width = w

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    name = f"recettes_{period}_{rep.start}_{rep.end}.xlsx"
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})


_FONT_READY = False


def _register_fonts() -> None:
    global _FONT_READY
    if _FONT_READY:
        return
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    pdfmetrics.registerFont(TTFont("Amiri", str(FONTS / "Amiri-Regular.ttf")))
    pdfmetrics.registerFont(TTFont("Amiri-Bold", str(FONTS / "Amiri-Bold.ttf")))
    _FONT_READY = True


_AR = re.compile(r"[\u0600-\u06FF]")


def ar(text: str) -> str:
    """Shape + reorder Arabic for reportlab (which has no bidi support)."""
    if not _AR.search(text):
        return text
    import arabic_reshaper
    from bidi.algorithm import get_display
    return get_display(arabic_reshaper.reshape(text))


@router.get("/reports/revenue.pdf")
async def revenue_pdf(period: str = PeriodQ, start: str | None = None, end: str | None = None,
                      worker: str = "", _: dict = Depends(require_admin)):
    from math import ceil
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.graphics.shapes import Drawing, Line, String, Rect, Circle
    from reportlab.platypus import (
        Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle, HRFlowable, KeepTogether
    )

    _register_fonts()
    rep = await build_report(period, start, end, worker)
    wrep = await build_worker_report(period, start, end, worker)
    invoice_docs = await db.invoices.find(
        {"day": {"$gte": rep.start, "$lte": rep.end}},
        {"_id": 0, "total": 1, "paid_amount": 1, "balance": 1},
    ).to_list(100000)
    invoice_totals = {
        "total": round(sum(float(i.get("total") or 0) for i in invoice_docs), 3),
        "paid": round(sum(float(i.get("paid_amount") or 0) for i in invoice_docs), 3),
        "balance": round(sum(float(i.get("balance") or 0) for i in invoice_docs), 3),
    }
    m = await _mill()
    mill = m.mill_name or "Huilerie Pro"
    t_fr, t_ar = _titles(period)

    # Visual identity inspired by the supplied reference: blue, gold, green and
    # cool grey. This changes presentation only; report data and calculations stay intact.
    navy = colors.HexColor("#24577D")
    blue = colors.HexColor("#3978C8")
    light_blue = colors.HexColor("#DCEBFA")
    pale_blue = colors.HexColor("#EFF6FC")
    gold = colors.HexColor("#D6A000")
    pale_gold = colors.HexColor("#FFF3CC")
    green = colors.HexColor("#9BCB83")
    pale_green = colors.HexColor("#EEF7E9")
    ink = colors.HexColor("#263746")
    muted = colors.HexColor("#64748B")
    border = colors.HexColor("#C9D5E1")
    white = colors.white
    orange = colors.HexColor("#E9823B")
    slate = colors.HexColor("#8A98A8")

    title = ParagraphStyle(
        "ReportTitle", fontName="Amiri-Bold", fontSize=21, leading=27,
        alignment=TA_LEFT, textColor=blue, spaceAfter=2,
    )
    subtitle = ParagraphStyle(
        "ReportSubtitle", fontName="Amiri", fontSize=8.5, leading=12,
        alignment=TA_LEFT, textColor=muted,
    )
    section = ParagraphStyle(
        "ReportSection", fontName="Amiri-Bold", fontSize=13, leading=17,
        alignment=TA_LEFT, textColor=blue, spaceBefore=7, spaceAfter=5,
    )
    chart_title = ParagraphStyle(
        "ReportChartTitle", fontName="Amiri-Bold", fontSize=9.5, leading=12,
        alignment=TA_CENTER, textColor=blue,
    )
    card_label = ParagraphStyle(
        "ReportCardLabel", fontName="Amiri", fontSize=7.5, leading=10,
        alignment=TA_CENTER, textColor=white,
    )
    card_value = ParagraphStyle(
        "ReportCardValue", fontName="Amiri-Bold", fontSize=14, leading=18,
        alignment=TA_CENTER, textColor=white,
    )
    table_head = ParagraphStyle(
        "ReportTableHead", fontName="Amiri-Bold", fontSize=7.2, leading=9,
        alignment=TA_CENTER, textColor=navy,
    )
    table_cell = ParagraphStyle(
        "ReportTableCell", fontName="Amiri", fontSize=7.3, leading=9.5,
        alignment=TA_CENTER, textColor=ink,
    )
    table_total = ParagraphStyle(
        "ReportTableTotal", fontName="Amiri-Bold", fontSize=7.4, leading=9.5,
        alignment=TA_CENTER, textColor=navy,
    )
    note_style = ParagraphStyle(
        "ReportNote", fontName="Amiri", fontSize=8, leading=11,
        alignment=TA_CENTER, textColor=muted,
    )

    def p(value, style=table_cell):
        return Paragraph(ar(str(value)), style)

    def money(value):
        return f"{_tn_money(value)} DT"

    def make_card(label, value, background):
        cell = Table(
            [[Paragraph(ar(label), card_label)], [Paragraph(ar(str(value)), card_value)]],
            colWidths=[43 * mm],
            rowHeights=[12 * mm, 14 * mm],
        )
        cell.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), background),
            ("BOX", (0, 0), (-1, -1), 0.5, background),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))
        return cell

    def axis_step(value):
        return max(1, ceil(max(float(value or 0), 1) / 4))

    def chart_drawing(values, labels, chart_kind, fill):
        # Draw charts with ReportLab primitives instead of chart widgets.
        # This avoids unsupported widget attributes across ReportLab versions.
        drawing = Drawing(250, 132)
        clean_values = [max(0.0, float(v or 0)) for v in values]
        clean_labels = [str(label) for label in labels]
        if not clean_values:
            clean_values, clean_labels = [0.0], ["—"]
        if len(clean_labels) != len(clean_values):
            clean_labels = [str(i + 1) for i in range(len(clean_values))]

        left, right, bottom, top = 30, 238, 29, 111
        plot_width, plot_height = right - left, top - bottom
        max_value = max(clean_values + [1.0])
        axis_max = max(1.0, max_value * 1.15)

        for tick in range(5):
            y = bottom + (plot_height * tick / 4)
            value = axis_max * tick / 4
            drawing.add(Line(left, y, right, y, strokeColor=border, strokeWidth=0.45))
            drawing.add(String(
                left - 4, y - 2, f"{value:.0f}",
                fontName="Helvetica", fontSize=5.5,
                textAnchor="end", fillColor=muted,
            ))

        count = len(clean_values)
        slot = plot_width / count
        points = []
        for index, value in enumerate(clean_values):
            x = left + slot * (index + 0.5)
            y = bottom + (value / axis_max) * plot_height
            points.append((x, y))
            label = clean_labels[index][:8]
            drawing.add(String(
                x, 12, label, fontName="Helvetica", fontSize=5.2,
                textAnchor="middle", fillColor=ink,
            ))

        if chart_kind == "line":
            for index in range(len(points) - 1):
                x1, y1 = points[index]
                x2, y2 = points[index + 1]
                drawing.add(Line(x1, y1, x2, y2, strokeColor=fill, strokeWidth=2))
            for x, y in points:
                drawing.add(Circle(x, y, 2.2, fillColor=fill, strokeColor=fill))
        else:
            bar_width = min(13.0, max(3.0, slot * 0.58))
            for (x, y), value in zip(points, clean_values):
                height = max(0.8, y - bottom)
                drawing.add(Rect(
                    x - bar_width / 2, bottom, bar_width, height,
                    fillColor=fill, strokeColor=fill, strokeWidth=0.3,
                ))
        drawing.add(Line(left, bottom, right, bottom, strokeColor=muted, strokeWidth=0.6))
        return drawing

    def make_report_table(headers, rows, widths, total_rows=1):
        rendered = [[p(value, table_head) for value in row] for row in headers]
        rendered.extend([
            [p(value, table_total if index >= len(rows) - total_rows else table_cell) for value in row]
            for index, row in enumerate(rows)
        ])
        result = Table(rendered, colWidths=widths, repeatRows=len(headers), hAlign="CENTER")
        styles = [
            ("BACKGROUND", (0, 0), (-1, 0), light_blue),
            ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#E8F1F9")),
            ("TEXTCOLOR", (0, 0), (-1, -1), ink),
            ("GRID", (0, 0), (-1, -1), 0.35, border),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("BACKGROUND", (0, -total_rows), (-1, -1), pale_blue),
            ("LINEABOVE", (0, -total_rows), (-1, -total_rows), 1, blue),
        ]
        body_end = len(rendered) - total_rows - 1
        if body_end >= len(headers):
            styles.append(("ROWBACKGROUNDS", (0, len(headers)), (-1, body_end), [white, pale_blue]))
        result.setStyle(TableStyle(styles))
        return result

    # Main report and worker data are unchanged from the existing report builders.
    labels = [r.period for r in rep.rows]
    revenue_values = [r.revenue for r in rep.rows]
    load_values = [r.loads for r in rep.rows]

    main_rows = [
        [r.period if r.period != "TOTAL" else "TOTAL / المجموع", r.loads,
         f"{r.olive_kg:,.1f}", f"{r.oil_kg:,.1f}", money(r.revenue)]
        for r in rep.rows + [rep.total]
    ]
    worker_rows = [
        [r.day, r.full_name, r.loads, f"{r.olive_kg:,.1f}",
         f"{r.oil_kg:,.1f}", money(r.revenue)]
        for r in wrep.rows
    ] + [
        ["TOTAL / المجموع", r.full_name, r.loads, f"{r.olive_kg:,.1f}",
         f"{r.oil_kg:,.1f}", money(r.revenue)]
        for r in wrep.totals
    ]

    contact = " • ".join(x for x in [m.mill_address, m.mill_phone] if x)

    def draw_footer(canvas, doc):
        canvas.saveState()
        page_width, _ = doc.pagesize
        canvas.setStrokeColor(border)
        canvas.setLineWidth(0.6)
        canvas.line(13 * mm, 12 * mm, page_width - 13 * mm, 12 * mm)
        canvas.setFont("Amiri", 7.5)
        canvas.setFillColor(muted)
        canvas.drawString(13 * mm, 7 * mm, ar(mill))
        canvas.drawRightString(page_width - 13 * mm, 7 * mm, f"Page {doc.page}")
        canvas.restoreState()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=12 * mm, rightMargin=12 * mm,
        topMargin=10 * mm, bottomMargin=17 * mm,
        title=f"Rapport des recettes - {mill}", author=mill,
    )

    cards = Table(
        [[
            make_card("RECETTES ENCAISSÉES", money(rep.total.revenue), navy),
            make_card("NOMBRE DE CHARGEMENTS", rep.total.loads, gold),
            make_card("OLIVES TRAITÉES (KG)", f"{rep.total.olive_kg:,.1f}", colors.HexColor("#78A95E")),
            make_card("HUILE EXTRAITE (LI)", f"{rep.total.oil_kg:,.1f}", blue),
        ]],
        colWidths=[45.5 * mm] * 4,
        hAlign="LEFT",
    )
    cards.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 1),
        ("RIGHTPADDING", (0, 0), (-1, -1), 1),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    chart_pair = Table(
        [[
            [Paragraph(ar("ÉVOLUTION DES RECETTES"), chart_title),
             chart_drawing(revenue_values, labels, "line", blue)],
            [Paragraph(ar("CHARGEMENTS PAR PÉRIODE"), chart_title),
             chart_drawing(load_values, labels, "bar", gold)],
        ]],
        colWidths=[92 * mm, 92 * mm],
        hAlign="CENTER",
    )
    chart_pair.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))

    main_headers = [
        ["Période", "Chargements", "Olives (kg)", "Huile (Li)", "Recettes (DT)"],
        HEAD_AR,
    ]
    worker_headers = [WHEAD_FR, WHEAD_AR]
    story = [
        Paragraph(ar(mill.upper()), title),
        Paragraph(ar(f"{t_fr} — {t_ar}"), subtitle),
        Paragraph(ar(f"Période : du {rep.start} au {rep.end}" + (f" | Employé : {worker}" if worker else "")), subtitle),
        Paragraph(ar(contact), subtitle) if contact else Spacer(1, 2),
        Spacer(1, 7),
        HRFlowable(width="100%", thickness=1.5, color=blue),
        Spacer(1, 8),
        cards,
        Spacer(1, 10),
        chart_pair,
        Spacer(1, 4),
        Paragraph(ar("SYNTHÈSE DES RÉSULTATS"), section),
        make_report_table(main_headers, main_rows, [36 * mm, 29 * mm, 32 * mm, 31 * mm, 42 * mm], 1),
        Spacer(1, 10),
        Paragraph(ar("RÉSULTATS PAR EMPLOYÉ"), section),
    ]

    if worker_rows:
        story.append(make_report_table(
            worker_headers, worker_rows,
            [27 * mm, 37 * mm, 25 * mm, 29 * mm, 28 * mm, 40 * mm],
            max(len(wrep.totals), 1),
        ))
    else:
        story.append(Paragraph(ar("Aucune donnée pour cette période / لا توجد بيانات لهذه الفترة"), note_style))

    story.extend([
        Spacer(1, 10),
        Paragraph(ar("SITUATION DES FACTURES"), section),
    ])
    invoice_summary = [
        [p("Total des factures / مجموع الفواتير", table_head), p(money(invoice_totals["total"]), table_total)],
        [p("Montant payé / المبلغ المدفوع", table_head), p(money(invoice_totals["paid"]), table_total)],
        [p("Reste à payer / المبلغ المتبقي", table_head), p(money(invoice_totals["balance"]), table_total)],
    ]
    invoice_table = Table(invoice_summary, colWidths=[125 * mm, 60 * mm], hAlign="CENTER")
    invoice_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), light_blue),
        ("BACKGROUND", (1, 0), (1, -1), pale_gold),
        ("GRID", (0, 0), (-1, -1), 0.4, border),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(invoice_table)

    doc.build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)
    buf.seek(0)
    filename = f"recettes_{period}_{rep.start}_{rep.end}.pdf"
    return StreamingResponse(
        buf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

# ---------- Clients ----------
@router.get("/clients", response_model=list[ClientSummary])
async def list_clients(q: str = "", user: dict = Depends(current_user)):
    sflt = await season_filter()
    match: dict = {"cancelled": {"$ne": True}, **sflt}
    if q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        match["$or"] = [{"phone": rx}, {"client_name": rx}]
    pipeline = [
        {"$match": match},
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": "$phone", "client_name": {"$first": "$client_name"}, "loads_count": {"$sum": 1},
            "olive_kg": {"$sum": "$olive_kg"}, "oil_kg": {"$sum": {"$ifNull": ["$oil_kg", 0]}},
            "last_visit": {"$first": "$created_at"},
            "amount": {"$sum": {"$multiply": ["$olive_kg", {"$ifNull": ["$price_per_kg", 0]}]}},
        }},
        {"$sort": {"last_visit": -1}},
        {"$limit": 300},
    ]
    is_admin = user["role"] == "admin"
    out = []
    async for g in db.loads.aggregate(pipeline):
        out.append(ClientSummary(
            phone=g["_id"], client_name=g["client_name"], loads_count=g["loads_count"],
            olive_kg=round(g["olive_kg"], 2), oil_kg=round(g["oil_kg"], 2),
            last_visit=_aware(g["last_visit"]), amount=round(g["amount"], 3) if is_admin else None,
        ))
    # carnet is global: clients known from other seasons appear with this season's totals = 0
    seen = {c.phone for c in out}
    omatch = {k: v for k, v in match.items() if k != "season_id"}
    omatch["phone"] = {"$nin": list(seen)}
    async for g in db.loads.aggregate([
        {"$match": omatch}, {"$sort": {"created_at": -1}},
        {"$group": {"_id": "$phone", "client_name": {"$first": "$client_name"}, "last_visit": {"$first": "$created_at"}}},
        {"$sort": {"last_visit": -1}}, {"$limit": 300},
    ]):
        out.append(ClientSummary(phone=g["_id"], client_name=g["client_name"], loads_count=0, olive_kg=0, oil_kg=0,
                                 last_visit=_aware(g["last_visit"]), amount=0 if is_admin else None))
    # clients registered via "+ Nouveau client" who have no load yet
    seen = {c.phone for c in out}
    cflt: dict = {"phone": {"$nin": list(seen)}}
    if q.strip():
        cflt["$or"] = match["$or"]
    async for c in db.clients.find(cflt, {"_id": 0}).sort("created_at", -1).limit(300):
        out.append(ClientSummary(phone=c["phone"], client_name=c["client_name"], loads_count=0, olive_kg=0, oil_kg=0,
                                 last_visit=_aware(c["created_at"]), amount=0 if is_admin else None))
    return out


@router.get("/clients/options", response_model=list[ClientSummary])
async def list_client_options(
    limit: int = Query(default=500, ge=1, le=1000),
    skip: int = Query(default=0, ge=0),
    user: dict = Depends(current_user),
):
    """Return a stable, globally deduplicated client selector without the legacy 300-row cap."""
    pipeline = [
        {"$match": {"cancelled": {"$ne": True}, "phone": {"$type": "string", "$ne": ""}}},
        {"$sort": {"created_at": -1, "id": 1}},
        {"$project": {"_id": 0, "phone": 1, "client_name": 1, "created_at": 1}},
        {"$unionWith": {
            "coll": "clients",
            "pipeline": [
                {"$match": {"phone": {"$type": "string", "$ne": ""}}},
                {"$project": {"_id": 0, "phone": 1, "client_name": 1, "created_at": 1}},
            ],
        }},
        {"$sort": {"created_at": -1, "phone": 1}},
        {"$group": {
            "_id": "$phone",
            "client_name": {"$first": "$client_name"},
            "last_visit": {"$first": "$created_at"},
        }},
        {"$sort": {"client_name": 1, "_id": 1}},
        {"$skip": skip},
        {"$limit": limit},
    ]
    is_admin = user["role"] == "admin"
    return [
        ClientSummary(
            phone=row["_id"],
            client_name=row.get("client_name") or row["_id"],
            loads_count=0,
            olive_kg=0,
            oil_kg=0,
            last_visit=_aware(row["last_visit"]),
            amount=0 if is_admin else None,
        )
        async for row in db.loads.aggregate(pipeline)
    ]


@router.post("/clients", response_model=ClientSummary)
async def create_client(body: ClientCreate, user: dict = Depends(current_user)):
    phone = re.sub(r"\s+", "", body.phone)
    existing = await db.loads.find_one({"phone": phone}, {"_id": 0, "client_name": 1})
    if existing or await db.clients.find_one({"phone": phone}):
        raise HTTPException(409, "client_exists")
    now = datetime.now(timezone.utc)
    await db.clients.insert_one({"phone": phone, "client_name": body.client_name.strip(), "created_at": now})
    return ClientSummary(phone=phone, client_name=body.client_name.strip(), loads_count=0, olive_kg=0, oil_kg=0,
                         last_visit=now, amount=0 if user["role"] == "admin" else None)


@router.put("/clients/{phone}", response_model=ClientUpdate)
async def update_client(phone: str, body: ClientUpdate, _: dict = Depends(require_admin)):
    new_phone = re.sub(r"\s+", "", body.phone)
    res = await db.loads.update_many(
        {"phone": phone.strip()}, {"$set": {"client_name": body.client_name.strip(), "phone": new_phone}}
    )
    cres = await db.clients.update_one(
        {"phone": phone.strip()}, {"$set": {"client_name": body.client_name.strip(), "phone": new_phone}}
    )
    if not res.matched_count and not cres.matched_count:
        raise HTTPException(404, "client_not_found")
    return ClientUpdate(client_name=body.client_name.strip(), phone=new_phone)


async def _ensure_client_has_no_invoices(load_ids: list[str], session=None) -> None:
    """Preserve invoice history, using the caller's transaction when supplied."""
    if not load_ids:
        return
    options = {"session": session} if session is not None else {}
    invoice = await db.invoices.find_one(
        {"load_id": {"$in": load_ids}},
        {"_id": 0, "number": 1},
        **options,
    )
    if invoice:
        raise HTTPException(409, "client_has_invoices")


async def _delete_client_in_transaction(phone: str, session):
    loads = await db.loads.find(
        {"phone": phone.strip()}, {"_id": 0, "id": 1}, session=session
    ).to_list(None)
    ids = [doc["id"] for doc in loads]
    await _ensure_client_has_no_invoices(ids, session=session)

    cres = await db.clients.delete_one({"phone": phone.strip()}, session=session)
    if not ids and not cres.deleted_count:
        raise HTTPException(404, "client_not_found")

    # Keep the client, loads, lab results and SMS history in one commit.
    await db.lab.delete_many({"load_id": {"$in": ids}}, session=session)
    await db.sms_log.delete_many({"load_id": {"$in": ids}}, session=session)
    res = await db.loads.delete_many({"id": {"$in": ids}}, session=session)
    return ClientDeleteResult(deleted=res.deleted_count)


@router.delete("/clients/{phone}", response_model=ClientDeleteResult)
async def delete_client(phone: str, _: dict = Depends(require_admin)):
    return await run_transaction(
        lambda session: _delete_client_in_transaction(phone, session)
    )


@router.get("/clients/{phone}", response_model=ClientHistory)
async def client_history(phone: str, user: dict = Depends(current_user)):
    docs = await db.loads.find({"phone": phone.strip(), **(await season_filter())}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    if not docs:
        # client known from another season (carnet is global) -> empty history for this season
        c = await db.clients.find_one({"phone": phone.strip()}, {"_id": 0}) or await db.loads.find_one(
            {"phone": phone.strip()}, {"_id": 0, "phone": 1, "client_name": 1}, sort=[("created_at", -1)])
        if not c:
            raise HTTPException(404, "client_not_found")
        return ClientHistory(phone=c["phone"], client_name=c["client_name"], loads_count=0, olive_kg=0, oil_kg=0,
                             avg_yield=None, amount=0 if user["role"] == "admin" else None, loads=[])
    labs = await _labs_for([d["id"] for d in docs])
    loads = [to_load(d, user, labs.get(d["id"])) for d in docs]
    valid = [d for d in docs if not d.get("cancelled")]
    olive = sum(d["olive_kg"] for d in valid)
    oil = sum(d.get("oil_kg") or 0 for d in valid)
    done = [d for d in valid if d.get("oil_kg") is not None]
    done_olive = sum(d["olive_kg"] for d in done)
    done_oil = sum(d["oil_kg"] for d in done)
    is_admin = user["role"] == "admin"
    return ClientHistory(
        phone=docs[0]["phone"], client_name=docs[0]["client_name"], loads_count=len(valid),
        olive_kg=round(olive, 2), oil_kg=round(oil, 2),
        avg_yield=round(done_oil / done_olive * 100, 2) if done_olive else None,
        amount=round(sum(l.amount or 0 for l in loads if l.status != "cancelled"), 3) if is_admin else None,
        loads=loads,
    )


# ---------- Lab certificate ----------
@router.get("/lab/{id}/certificate", response_model=Certificate)
async def certificate(id: str, user: dict = Depends(current_user)):
    lab = await db.lab.find_one({"id": id}, {"_id": 0})
    if not lab:
        raise HTTPException(404, "not_found")
    load = await db.loads.find_one({"id": lab["load_id"]}, {"_id": 0})
    return Certificate(
        analysis=LabAnalysis(**{**lab, "created_at": _aware(lab["created_at"])}),
        load=to_load(load, user, lab) if load else None,
        mill=await _mill(),
    )
