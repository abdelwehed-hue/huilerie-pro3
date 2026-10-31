import io
import uuid
import zipfile
from datetime import datetime, timezone

from bson import json_util
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from lib.auth import hash_password, require_admin
from lib.db import db
from models.schemas import AppSettings, User, UserCreate, UserUpdate

router = APIRouter(tags=["admin"])


def _user(doc: dict) -> User:
    dt = doc["created_at"]
    return User(**{**doc, "created_at": dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)})


@router.get("/admin/export.zip")
async def export_database(_: dict = Depends(require_admin)):
    """Admin-only full export: one Extended-JSON file per collection (mongoimport-compatible,
    one document per line). Twilio secrets are redacted."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in sorted(await db.list_collection_names()):
            lines = []
            async for doc in db[name].find({}):
                if name == "settings" and doc.get("key") == "twilio":
                    doc = {k: ("***REDACTED***" if any(s in k.lower() for s in ("token", "secret", "password")) else v)
                           for k, v in doc.items()}
                lines.append(json_util.dumps(doc, json_options=json_util.RELAXED_JSON_OPTIONS))
            zf.writestr(f"{name}.json", "\n".join(lines) + ("\n" if lines else ""))
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    return Response(buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="huilerie-export-{stamp}.zip"'})

@router.get("/admin/export.pdf")
async def export_database_pdf(_: dict = Depends(require_admin)):
    """Admin-only human-readable PDF export. Sensitive credentials are redacted."""
    import json
    import re
    from html import escape as html_escape
    from pathlib import Path

    import arabic_reshaper
    from bidi.algorithm import get_display
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    font_dir = Path(__file__).resolve().parent.parent / "fonts"
    regular_font = "DbExportAmiri"
    bold_font = "DbExportAmiriBold"
    if regular_font not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(regular_font, str(font_dir / "Amiri-Regular.ttf")))
    if bold_font not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(bold_font, str(font_dir / "Amiri-Bold.ttf")))

    arabic_pattern = re.compile(r"[\\u0600-\\u06FF]")
    sensitive_parts = ("password", "token", "secret", "api_key", "private_key", "credential")

    def shape(value: str) -> str:
        return get_display(arabic_reshaper.reshape(value)) if arabic_pattern.search(value) else value

    def redact(value):
        if isinstance(value, dict):
            clean = {}
            for key, item in value.items():
                if any(part in str(key).lower() for part in sensitive_parts):
                    clean[key] = "[MASQUÉ / مخفي]"
                else:
                    clean[key] = redact(item)
            return clean
        if isinstance(value, list):
            return [redact(item) for item in value]
        if isinstance(value, str) and value.startswith("data:"):
            return f"[Données intégrées omises du PDF — {len(value)} caractères; conservées dans ZIP]"
        return value

    def display_value(value) -> str:
        clean = redact(value)
        if isinstance(clean, str):
            result = clean
        else:
            result = json_util.dumps(clean, json_options=json_util.RELAXED_JSON_OPTIONS, ensure_ascii=False)
        if len(result) > 6000:
            result = result[:6000] + "… [contenu long tronqué dans le PDF; conserver le ZIP pour l'export complet]"
        return result

    title_style = ParagraphStyle("dbTitle", fontName=bold_font, fontSize=18, leading=24, alignment=TA_CENTER, spaceAfter=8)
    subtitle_style = ParagraphStyle("dbSub", fontName=regular_font, fontSize=9, leading=13, alignment=TA_CENTER, textColor=colors.HexColor("#57534E"))
    section_style = ParagraphStyle("dbSection", fontName=bold_font, fontSize=14, leading=19, textColor=colors.HexColor("#365314"), spaceBefore=10, spaceAfter=5)
    doc_style = ParagraphStyle("dbDoc", fontName=bold_font, fontSize=10, leading=14, textColor=colors.HexColor("#44403C"), spaceBefore=5, spaceAfter=3)
    cell_style = ParagraphStyle("dbCell", fontName=regular_font, fontSize=7.5, leading=10, wordWrap="CJK")
    key_style = ParagraphStyle("dbKey", fontName=bold_font, fontSize=7.5, leading=10, wordWrap="CJK")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=13 * mm, leftMargin=13 * mm,
                            topMargin=15 * mm, bottomMargin=17 * mm, title="Export de la base de données")

    collection_names = sorted(await db.list_collection_names())
    story = [
        Paragraph("Export de la base de données", title_style),
        Paragraph(shape("تصدير قاعدة البيانات"), title_style),
        Paragraph(f"Application: Oro Verde / Huilerie Pro — Date UTC: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}", subtitle_style),
        Paragraph("Document de consultation et d'impression. Les mots de passe et clés secrètes sont masqués. Les données image/base64 et les champs très longs peuvent être abrégés; utiliser le fichier ZIP pour une sauvegarde complète.", subtitle_style),
        Spacer(1, 8),
    ]

    def draw_footer(canvas, _document):
        canvas.saveState()
        canvas.setFont(regular_font, 8)
        canvas.setFillColor(colors.HexColor("#78716C"))
        canvas.drawString(13 * mm, 9 * mm, "Oro Verde — Export PDF")
        canvas.drawRightString(A4[0] - 13 * mm, 9 * mm, f"Page {_document.page}")
        canvas.restoreState()

    for collection_index, name in enumerate(collection_names):
        if collection_index:
            story.append(PageBreak())
        count = await db[name].count_documents({})
        story.append(Paragraph(f"{html_escape(name)} — {count} document(s)", section_style))
        doc_number = 0
        async for record in db[name].find({}).sort("_id", 1):
            doc_number += 1
            story.append(Paragraph(f"Document {doc_number}", doc_style))
            rows = [[Paragraph(shape("Champ / الحقل"), key_style), Paragraph(shape("Valeur / القيمة"), key_style)]]
            for key, value in record.items():
                rendered = display_value(value)
                rows.append([
                    Paragraph(shape(html_escape(str(key))), key_style),
                    Paragraph(shape(html_escape(rendered).replace("\\n", "<br/>")), cell_style),
                ])
            table = Table(rows, colWidths=[42 * mm, 142 * mm], repeatRows=1, splitByRow=1, hAlign="LEFT")
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#3F6212")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D6D3D1")),
                ("BACKGROUND", (0, 1), (0, -1), colors.HexColor("#F5F5F4")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]))
            story.extend([table, Spacer(1, 5)])
        if not count:
            story.append(Paragraph("Aucune donnée / لا توجد بيانات", subtitle_style))

    doc.build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)
    buf.seek(0)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    return Response(buf.getvalue(), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="huilerie-export-{stamp}.pdf"'})


@router.get("/users", response_model=list[User])
async def list_users(_: dict = Depends(require_admin)):
    docs = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", 1).to_list(500)
    return [_user(d) for d in docs]


@router.post("/users", response_model=User)
async def create_user(body: UserCreate, _: dict = Depends(require_admin)):
    username = body.username.strip().lower()
    if await db.users.find_one({"username": username}):
        raise HTTPException(409, "username_taken")
    doc = {
        "id": str(uuid.uuid4()), "username": username, "full_name": body.full_name.strip(),
        "password_hash": hash_password(body.password), "role": body.role, "active": True,
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(doc)
    return _user(doc)


@router.patch("/users/{id}", response_model=User)
async def update_user(id: str, body: UserUpdate, admin: dict = Depends(require_admin)):
    upd: dict = {}
    if body.username is not None:
        uname = body.username.strip().lower()
        if await db.users.find_one({"username": uname, "id": {"$ne": id}}):
            raise HTTPException(409, "username_taken")
        upd["username"] = uname
    if body.full_name is not None:
        upd["full_name"] = body.full_name.strip()
    if body.role is not None:
        upd["role"] = body.role
    if body.active is not None:
        upd["active"] = body.active
    if body.password:
        upd["password_hash"] = hash_password(body.password)
    if id == admin["id"] and (upd.get("active") is False or upd.get("role") == "worker"):
        raise HTTPException(400, "cannot_demote_self")
    doc = await db.users.find_one_and_update(
        {"id": id}, {"$set": upd} if upd else {"$set": {}},
        projection={"_id": 0, "password_hash": 0}, return_document=True,
    ) if upd else await db.users.find_one({"id": id}, {"_id": 0, "password_hash": 0})
    if not doc:
        raise HTTPException(404, "not_found")
    return _user(doc)


@router.delete("/users/{id}")
async def delete_user(id: str, admin: dict = Depends(require_admin)):
    if id == admin["id"]:
        raise HTTPException(400, "cannot_delete_self")
    res = await db.users.delete_one({"id": id})
    if not res.deleted_count:
        raise HTTPException(404, "not_found")
    return {"ok": True}


@router.get("/settings", response_model=AppSettings)
async def get_settings(_: dict = Depends(require_admin)):
    s = await db.settings.find_one({"key": "app"}, {"_id": 0, "key": 0}) or {"price_per_kg": 0}
    return AppSettings(**s)


@router.put("/settings", response_model=AppSettings)
async def put_settings(body: AppSettings, _: dict = Depends(require_admin)):
    await db.settings.update_one({"key": "app"}, {"$set": body.model_dump()}, upsert=True)
    return body
