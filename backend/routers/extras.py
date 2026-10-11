"""SMS log, revenue reports (JSON / Excel / PDF), client history, lab certificates."""

import io
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

from lib.auth import current_user, require_admin
from lib.dates import today_iso
from lib.db import db
from models.schemas import (
    Certificate, ClientHistory, ClientSummary, LabAnalysis, MillInfo, ReportRow,
    RevenueReport, SmsLog,
)
from routers.loads import _labs_for, to_load

router = APIRouter(tags=["extras"])


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# ---------- SMS ----------
@router.get("/sms", response_model=list[SmsLog])
async def list_sms(_: dict = Depends(current_user)):
    docs = await db.sms_log.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
    return [SmsLog(**{**d, "created_at": _aware(d["created_at"])}) for d in docs]


# ---------- Revenue report ----------
async def build_report(period: str, start: str | None, end: str | None) -> RevenueReport:
    end = end or today_iso()
    if not start:
        e = datetime.strptime(end, "%Y-%m-%d")
        start = (e - timedelta(days=29)).strftime("%Y-%m-%d") if period == "daily" else f"{e.year}-01-01"
    docs = await db.loads.find({"day": {"$gte": start, "$lte": end}}, {"_id": 0}).to_list(100000)
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


PeriodQ = Query("daily", pattern="^(daily|monthly)$")


@router.get("/reports/revenue", response_model=RevenueReport)
async def revenue_report(period: str = PeriodQ, start: str | None = None, end: str | None = None,
                         _: dict = Depends(require_admin)):
    return await build_report(period, start, end)


HEAD = ["Période", "Chargements", "Olives (kg)", "Huile (kg)", "Recettes (DT)"]


@router.get("/reports/revenue.xlsx")
async def revenue_xlsx(period: str = PeriodQ, start: str | None = None, end: str | None = None,
                       _: dict = Depends(require_admin)):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    rep = await build_report(period, start, end)
    mill = (await db.settings.find_one({"key": "app"}) or {}).get("mill_name") or "Huilerie Pro"
    wb = Workbook()
    ws = wb.active
    ws.title = "Recettes"
    ws.append([f"{mill} — Rapport des recettes ({'journalier' if period == 'daily' else 'mensuel'})"])
    ws["A1"].font = Font(bold=True, size=14)
    ws.append([f"Du {rep.start} au {rep.end}"])
    ws.append([])
    ws.append(HEAD)
    for c in ws[4]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="3F6212")
    for r in rep.rows + [rep.total]:
        ws.append([r.period, r.loads, r.olive_kg, r.oil_kg, r.revenue])
    for c in ws[ws.max_row]:
        c.font = Font(bold=True)
    for col, w in zip("ABCDE", [16, 14, 14, 14, 16]):
        ws.column_dimensions[col].width = w
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    name = f"recettes_{period}_{rep.start}_{rep.end}.xlsx"
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/reports/revenue.pdf")
async def revenue_pdf(period: str = PeriodQ, start: str | None = None, end: str | None = None,
                      _: dict = Depends(require_admin)):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    rep = await build_report(period, start, end)
    s = await db.settings.find_one({"key": "app"}) or {}
    mill = s.get("mill_name") or "Huilerie Pro"
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, title="Rapport des recettes")
    st = getSampleStyleSheet()
    data = [HEAD] + [[r.period, r.loads, f"{r.olive_kg:,.1f}", f"{r.oil_kg:,.1f}", f"{r.revenue:,.3f}"]
                     for r in rep.rows + [rep.total]]
    t = Table(data, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#3F6212")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#FAF5FF")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#F2F8EE")]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E7E5E4")),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
    ]))
    sub = " · ".join(x for x in [s.get("mill_address"), s.get("mill_phone")] if x)
    story = [
        Paragraph(f"<b>{mill}</b>", st["Title"]),
        Paragraph(sub, st["Normal"]) if sub else Spacer(1, 1),
        Spacer(1, 8),
        Paragraph(f"Rapport des recettes {'journalier' if period == 'daily' else 'mensuel'} — du {rep.start} au {rep.end}", st["Heading2"]),
        Spacer(1, 8),
        t,
    ]
    doc.build(story)
    buf.seek(0)
    name = f"recettes_{period}_{rep.start}_{rep.end}.pdf"
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})


# ---------- Clients ----------
@router.get("/clients", response_model=list[ClientSummary])
async def list_clients(q: str = "", user: dict = Depends(current_user)):
    import re
    match: dict = {}
    if q.strip():
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        match = {"$or": [{"phone": rx}, {"client_name": rx}]}
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
    olive = sum(d["olive_kg"] for d in docs)
    oil = sum(d.get("oil_kg") or 0 for d in docs)
    done_olive = sum(d["olive_kg"] for d in docs if d.get("oil_kg") is not None)
    is_admin = user["role"] == "admin"
    return ClientHistory(
        phone=docs[0]["phone"], client_name=docs[0]["client_name"], loads_count=len(docs),
        olive_kg=round(olive, 2), oil_kg=round(oil, 2),
        avg_yield=round(oil / done_olive * 100, 2) if done_olive else None,
        amount=round(sum(l.amount or 0 for l in loads), 3) if is_admin else None,
        loads=loads,
    )


# ---------- Lab certificate ----------
@router.get("/lab/{id}/certificate", response_model=Certificate)
async def certificate(id: str, user: dict = Depends(current_user)):
    lab = await db.lab.find_one({"id": id}, {"_id": 0})
    if not lab:
        raise HTTPException(404, "not_found")
    load = await db.loads.find_one({"id": lab["load_id"]}, {"_id": 0})
    s = await db.settings.find_one({"key": "app"}) or {}
    return Certificate(
        analysis=LabAnalysis(**{**lab, "created_at": _aware(lab["created_at"])}),
        load=to_load(load, user, lab) if load else None,
        mill=MillInfo(mill_name=s.get("mill_name", ""), mill_address=s.get("mill_address", ""),
                      mill_phone=s.get("mill_phone", "")),
    )
