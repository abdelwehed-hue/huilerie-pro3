"""SMS log, revenue + per-worker reports (JSON / Excel / PDF, bilingual FR+AR), client history, lab certificates."""

import io
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from lib.auth import current_user, require_admin
from lib.dates import today_iso
from lib.db import db
from lib.sms import sms_mode
from models.schemas import (
    Certificate, ClientHistory, ClientSummary, LabAnalysis, MillInfo, ReportRow,
    RevenueReport, SmsLog, SmsStatus, WorkerReport, WorkerRow,
)
from routers.loads import _labs_for, to_load

router = APIRouter(tags=["extras"])
FONTS = Path(__file__).resolve().parent.parent / "fonts"


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


async def _mill() -> MillInfo:
    s = await db.settings.find_one({"key": "app"}) or {}
    return MillInfo(mill_name=s.get("mill_name", ""), mill_address=s.get("mill_address", ""),
                    mill_phone=s.get("mill_phone", ""))


@router.get("/mill", response_model=MillInfo)
async def mill_info(_: dict = Depends(current_user)):
    return await _mill()


# ---------- SMS ----------
@router.get("/sms", response_model=list[SmsLog])
async def list_sms(_: dict = Depends(current_user)):
    docs = await db.sms_log.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
    return [SmsLog(**{**d, "created_at": _aware(d["created_at"])}) for d in docs]


@router.get("/sms/status", response_model=SmsStatus)
async def sms_status(_: dict = Depends(current_user)):
    s = await db.settings.find_one({"key": "app"}) or {}
    return SmsStatus(mode=sms_mode(), enabled=s.get("sms_enabled", True))


# ---------- Reports ----------
def _range(period: str, start: str | None, end: str | None) -> tuple[str, str]:
    end = end or today_iso()
    if not start:
        e = datetime.strptime(end, "%Y-%m-%d")
        start = (e - timedelta(days=29)).strftime("%Y-%m-%d") if period == "daily" else f"{e.year}-01-01"
    return start, end


async def build_report(period: str, start: str | None, end: str | None) -> RevenueReport:
    start, end = _range(period, start, end)
    docs = await db.loads.find({"day": {"$gte": start, "$lte": end}, "cancelled": {"$ne": True}}, {"_id": 0}).to_list(100000)
    agg: dict[str, list[float]] = {}
    for d in docs:
        key = d["day"] if period == "daily" else d["day"][:7]
        a = agg.setdefault(key, [0, 0.0, 0.0, 0.0])
        a[0] += 1
        a[1] += d["olive_kg"]
        a[2] += d.get("oil_kg") or 0.0
        a[3] += d["olive_kg"] * d.get("price_per_kg", 0)
    rows = [
        ReportRow(period=k, loads=int(v[0]), olive_kg=round(v[1], 2), oil_kg=round(v[2], 2), revenue=round(v[3], 3))
        for k, v in sorted(agg.items())
    ]
    total = ReportRow(
        period="TOTAL", loads=sum(r.loads for r in rows), olive_kg=round(sum(r.olive_kg for r in rows), 2),
        oil_kg=round(sum(r.oil_kg for r in rows), 2), revenue=round(sum(r.revenue for r in rows), 3),
    )
    return RevenueReport(period=period, start=start, end=end, rows=rows, total=total)


async def build_worker_report(period: str, start: str | None, end: str | None) -> WorkerReport:
    """Loads are credited to the worker who registered the arrival (created_by)."""
    start, end = _range(period, start, end)
    docs = await db.loads.find({"day": {"$gte": start, "$lte": end}, "cancelled": {"$ne": True}}, {"_id": 0}).to_list(100000)
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
                         _: dict = Depends(require_admin)):
    return await build_report(period, start, end)


@router.get("/reports/workers", response_model=WorkerReport)
async def worker_report(period: str = PeriodQ, start: str | None = None, end: str | None = None,
                        _: dict = Depends(require_admin)):
    return await build_worker_report(period, start, end)


HEAD_FR = ["Période", "Chargements", "Olives (kg)", "Huile (kg)", "Recettes (DT)"]
HEAD_AR = ["الفترة", "الحمولات", "الزيتون (كغ)", "الزيت (كغ)", "المداخيل (د.ت)"]
WHEAD_FR = ["Date", "Ouvrier", "Chargements", "Olives (kg)", "Huile (kg)", "Recettes (DT)"]
WHEAD_AR = ["التاريخ", "العامل", "الحمولات", "الزيتون (كغ)", "الزيت (كغ)", "المداخيل (د.ت)"]


def _titles(period: str) -> tuple[str, str]:
    return (
        f"Rapport des recettes {'journalier' if period == 'daily' else 'mensuel'}",
        f"تقرير المداخيل {'اليومي' if period == 'daily' else 'الشهري'}",
    )


@router.get("/reports/revenue.xlsx")
async def revenue_xlsx(period: str = PeriodQ, start: str | None = None, end: str | None = None,
                       _: dict = Depends(require_admin)):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    rep = await build_report(period, start, end)
    wrep = await build_worker_report(period, start, end)
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
    for col, w in zip("ABCDEF", [20, 22, 14, 16, 14, 18]):
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
                      _: dict = Depends(require_admin)):
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    _register_fonts()
    rep = await build_report(period, start, end)
    wrep = await build_worker_report(period, start, end)
    m = await _mill()
    mill = m.mill_name or "Huilerie Pro"
    t_fr, t_ar = _titles(period)

    title = ParagraphStyle("t", fontName="Amiri-Bold", fontSize=20, leading=26, alignment=TA_CENTER)
    h2 = ParagraphStyle("h", fontName="Amiri-Bold", fontSize=13, leading=20, alignment=TA_CENTER)
    normal = ParagraphStyle("n", fontName="Amiri", fontSize=10, leading=15, alignment=TA_CENTER)

    def table(data: list[list], total_rows: int) -> Table:
        t = Table([[ar(str(c)) for c in row] for row in data], repeatRows=2)
        t.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -1), "Amiri"),
            ("FONTSIZE", (0, 0), (-1, -1), 9.5),
            ("BACKGROUND", (0, 0), (-1, 1), colors.HexColor("#3F6212")),
            ("TEXTCOLOR", (0, 0), (-1, 1), colors.white),
            ("FONTNAME", (0, 0), (-1, 1), "Amiri-Bold"),
            ("FONTNAME", (0, -total_rows), (-1, -1), "Amiri-Bold"),
            ("BACKGROUND", (0, -total_rows), (-1, -1), colors.HexColor("#FAF5FF")),
            ("ROWBACKGROUNDS", (0, 2), (-1, -total_rows - 1), [colors.white, colors.HexColor("#F2F8EE")]),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E7E5E4")),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        return t

    tot_label = "TOTAL / المجموع"
    data = [HEAD_FR, HEAD_AR] + [
        [r.period if r.period != "TOTAL" else tot_label, r.loads, f"{r.olive_kg:,.1f}", f"{r.oil_kg:,.1f}", f"{r.revenue:,.3f}"]
        for r in rep.rows + [rep.total]
    ]
    wdata = [WHEAD_FR, WHEAD_AR] + [
        [r.day, r.full_name, r.loads, f"{r.olive_kg:,.1f}", f"{r.oil_kg:,.1f}", f"{r.revenue:,.3f}"] for r in wrep.rows
    ] + [
        [tot_label, r.full_name, r.loads, f"{r.olive_kg:,.1f}", f"{r.oil_kg:,.1f}", f"{r.revenue:,.3f}"] for r in wrep.totals
    ]

    sub = " · ".join(x for x in [m.mill_address, m.mill_phone] if x)
    story = [
        Paragraph(ar(mill), title),
        Paragraph(ar(sub), normal) if sub else Spacer(1, 1),
        Spacer(1, 10),
        Paragraph(t_fr, h2),
        Paragraph(ar(t_ar), h2),
        # Arabic segment pre-ordered visually (RTL) so the dates keep their digit order
        Paragraph(f"Du {rep.start} au {rep.end} — {rep.end} {ar('إلى')} {rep.start} {ar('من')}", normal),
        Spacer(1, 10),
        table(data, 1),
        Spacer(1, 22),
        Paragraph("Recettes par ouvrier", h2),
        Paragraph(ar("المداخيل حسب العامل"), h2),
        Spacer(1, 6),
    ]
    if wrep.rows:
        story.append(table(wdata, max(len(wrep.totals), 1)))
    else:
        story.append(Paragraph("—", normal))

    buf = io.BytesIO()
    SimpleDocTemplate(buf, pagesize=A4, title="Rapport des recettes").build(story)
    buf.seek(0)
    name = f"recettes_{period}_{rep.start}_{rep.end}.pdf"
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})


# ---------- Clients ----------
@router.get("/clients", response_model=list[ClientSummary])
async def list_clients(q: str = "", user: dict = Depends(current_user)):
    match: dict = {"cancelled": {"$ne": True}}
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
    return out


@router.get("/clients/{phone}", response_model=ClientHistory)
async def client_history(phone: str, user: dict = Depends(current_user)):
    docs = await db.loads.find({"phone": phone.strip()}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    if not docs:
        raise HTTPException(404, "client_not_found")
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
