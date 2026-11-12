import io
import uuid
import zipfile
from datetime import datetime, timezone

from bson import json_util
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from lib.auth import hash_password, require_admin
from lib.security_config import has_known_demo_password
from lib.db import db, run_transaction
from lib.money import money_db, money_float
from models.schemas import AppSettings, User, UserCreate, UserUpdate

router = APIRouter(tags=["admin"])


def _user(doc: dict) -> User:
    dt = doc["created_at"]
    return User(**{**doc, "created_at": dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)})


# Collections containing operational/test records. Configuration, users, and
# both numbering sequences are intentionally excluded from this reset.
RESET_DATA_COLLECTIONS = (
    "loads", "lab", "invoices", "clients", "sms_log",
    "commercial_suppliers", "commercial_buyers", "commercial_custody_owners",
    "commercial_olive_purchases", "commercial_oil_purchase_documents",
    "commercial_oil_purchase_payments", "commercial_sales",
    "commercial_sales_invoices", "commercial_sale_payments",
    "commercial_production_runs", "commercial_lots",
    "commercial_stock_movements", "commercial_stock_balances",
    "commercial_internal_movements", "commercial_quality_assessments",
    "commercial_preproduction_samples", "commercial_customer_custody_receipts",
    "commercial_customer_custody_releases", "commercial_sale_returns",
    "commercial_sale_return_rejections", "commercial_buyer_return_rejections",
    "commercial_credit_notes", "commercial_buyer_credit_ledger",
    "commercial_buyer_credit_applications", "commercial_payment_reversals",
    "commercial_quality_releases", "commercial_pump_runtime",
)
RESET_AUDIT_COLLECTIONS = ("commercial_audit_events",)


@router.get("/admin/reset/preview")
async def preview_full_reset(_: dict = Depends(require_admin)):
    counts = {}
    existing = set(await db.list_collection_names())
    for name in RESET_DATA_COLLECTIONS:
        counts[name] = await db[name].count_documents({}) if name in existing else 0
    counts["commercial_audit_events"] = (
        await db["commercial_audit_events"].count_documents({})
        if "commercial_audit_events" in existing else 0
    )
    return {
        "collections": counts,
        "total_documents": sum(counts.values()),
        "preserved": [
            "settings", "users", "counters", "commercial_counters",
            "commercial_tanks", "commercial_locations", "commercial_varieties",
            "tv_state", "tv_music_files.files", "tv_music_files.chunks",
            "backup_numeric_policy_*",
        ],
    }


@router.post("/admin/reset")
async def reset_operational_data(body: dict, admin: dict = Depends(require_admin)):
    if body.get("confirmation") != "RESET":
        raise HTTPException(400, "reset_confirmation_required")
    requested = body.get("selected_collections")
    if not isinstance(requested, list) or not requested:
        raise HTTPException(400, "reset_selection_required")
    allowed = set(RESET_DATA_COLLECTIONS + RESET_AUDIT_COLLECTIONS)
    if any(not isinstance(name, str) for name in requested) or len(requested) != len(set(requested)) or not set(requested).issubset(allowed):
        raise HTTPException(400, "invalid_reset_selection")
    collections = tuple(requested)
    clear_audit = "commercial_audit_events" in collections
    existing = set(await db.list_collection_names())
    before = {
        name: await db[name].count_documents({}) if name in existing else 0
        for name in collections
    }

    async def perform(session):
        deleted = {}
        for name in collections:
            if name in existing:
                result = await db[name].delete_many({}, session=session)
                deleted[name] = result.deleted_count
            else:
                deleted[name] = 0
        return deleted

    from lib.db import run_transaction
    deleted = await run_transaction(perform)

    # This immutable operational record is deliberately outside the cleared audit
    # collection so the reset remains traceable even when historical audit is cleared.
    await db["admin_reset_audit"].insert_one({
        "event": "SELECTIVE_OPERATIONAL_RESET",
        "admin_id": admin.get("id"),
        "admin_username": admin.get("username"),
        "clear_audit": clear_audit,
        "selected_collections": list(collections),
        "deleted": deleted,
        "created_at": datetime.now(timezone.utc),
    })
    return {"ok": True, "deleted": deleted, "preserved_counters": True}


_COUNTER_CODE_FIELDS = (
    "code", "batch_code", "lot_code", "traceability_code",
    "document_number", "invoice_number", "payment_number", "reference",
)


def _counter_candidate_code(counter: dict) -> str:
    season = str(counter.get("season_code") or "")
    document_type = str(counter.get("document_type") or "")
    if len(season) != 4 or not season.isdigit():
        raise HTTPException(400, "invalid_counter_season")
    sequence = 0
    if document_type == "BATCH":
        return f"{season}A{sequence:04d}"
    public_type = "F" if document_type == "FAC" else document_type
    if not public_type.isalpha() or not (2 <= len(public_type) <= 8):
        raise HTTPException(400, "invalid_counter_document_type")
    return f"{season}{public_type}{sequence:04d}"


async def _counter_code_conflict(code: str, collection_names: set[str], session=None):
    query = {"$or": [{field: code} for field in _COUNTER_CODE_FIELDS]}
    excluded = {"commercial_counters", "counters", "admin_reset_audit"}
    for name in sorted(collection_names - excluded):
        options = {"session": session} if session is not None else {}
        found = await db[name].find_one(query, {"_id": 0, "id": 1}, **options)
        if found:
            return {"collection": name, "record_id": found.get("id")}
    return None


@router.get("/admin/reset/counters/preview")
async def preview_counter_reset(_: dict = Depends(require_admin)):
    """Show the zero-code candidate for every existing commercial sequence."""
    docs = await db["commercial_counters"].find(
        {}, {"_id": 0, "season_code": 1, "document_type": 1, "last_sequence": 1}
    ).sort([("season_code", 1), ("document_type", 1)]).to_list(500)
    names = set(await db.list_collection_names())
    counters = []
    skipped = []
    for doc in docs:
        key = f'{doc.get("season_code", "")}|{doc.get("document_type", "")}'
        try:
            candidate = _counter_candidate_code(doc)
        except HTTPException as exc:
            # A malformed legacy counter must not prevent the remaining counters
            # from being displayed and managed independently.
            skipped.append({
                "key": key,
                "reason": str(exc.detail),
            })
            continue
        conflict = await _counter_code_conflict(candidate, names)
        counters.append({
            "key": key,
            "season_code": doc.get("season_code"),
            "document_type": doc.get("document_type"),
            "current_sequence": doc.get("last_sequence", 0),
            "first_code": candidate,
            "conflict": conflict,
            "can_reset": conflict is None,
        })
    return {"counters": counters, "total": len(counters), "skipped": skipped}


@router.post("/admin/reset/counters")
async def reset_commercial_counters(body: dict, admin: dict = Depends(require_admin)):
    """Reset selected commercial sequences to -1 so their next issued code is 0000."""
    requested = body.get("selected_counters")
    if not isinstance(requested, list) or not requested:
        raise HTTPException(400, "counter_selection_required")
    if any(not isinstance(key, str) for key in requested) or len(requested) != len(set(requested)):
        raise HTTPException(400, "invalid_counter_selection")
    names = set(await db.list_collection_names())
    now = datetime.now(timezone.utc)

    async def perform(session):
        changed = []
        for key in requested:
            if "|" not in key:
                raise HTTPException(400, "invalid_counter_selection")
            season_code, document_type = key.split("|", 1)
            counter = await db["commercial_counters"].find_one(
                {"season_code": season_code, "document_type": document_type},
                {"_id": 0}, session=session,
            )
            if not counter:
                raise HTTPException(404, "counter_not_found")
            candidate = _counter_candidate_code(counter)
            conflict = await _counter_code_conflict(candidate, names, session=session)
            if conflict:
                raise HTTPException(409, {
                    "code": "counter_zero_code_already_exists",
                    "candidate": candidate,
                    "collection": conflict["collection"],
                })
            result = await db["commercial_counters"].update_one(
                {"season_code": season_code, "document_type": document_type},
                {"$set": {"last_sequence": -1, "updated_at": now}},
                session=session,
            )
            if result.matched_count != 1:
                raise HTTPException(409, "counter_changed_retry")
            changed.append({
                "season_code": season_code,
                "document_type": document_type,
                "previous_sequence": counter.get("last_sequence", 0),
                "next_code": candidate,
            })
        await db["commercial_audit_events"].insert_one({
            "id": str(uuid.uuid4()), "entity_type": "commercial_counters",
            "entity_id": "selected", "action": "COMMERCIAL_COUNTERS_RESET_TO_ZERO",
            "actor_user_id": admin.get("id"), "created_at": now,
            "details": {"counters": changed},
        }, session=session)
        return changed

    changed = await run_transaction(perform)
    await db["admin_reset_audit"].insert_one({
        "event": "COMMERCIAL_COUNTERS_RESET_TO_ZERO",
        "admin_id": admin.get("id"),
        "admin_username": admin.get("username"),
        "counters": changed,
        "created_at": now,
    })
    return {"ok": True, "reset": changed}


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

    def shape(value: str) -> str:
        has_arabic = any(0x0600 <= ord(char) <= 0x06FF for char in value)
        return get_display(arabic_reshaper.reshape(value)) if has_arabic else value

    sensitive_parts = ("password", "token", "secret", "api_key", "private_key", "credential")

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
    section_style = ParagraphStyle("dbSection", fontName=bold_font, fontSize=14, leading=19, textColor=colors.HexColor("#2563A6"), spaceBefore=10, spaceAfter=5)
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
                    Paragraph(shape(html_escape(rendered).replace("\n", "<br/>")), cell_style),
                ])
            table = Table(rows, colWidths=[42 * mm, 142 * mm], repeatRows=1, splitByRow=1, hAlign="LEFT")
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#DCEEFF")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#174A70")),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D6D3D1")),
                ("BACKGROUND", (0, 1), (0, -1), colors.HexColor("#EFF6FF")),
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
    password_hash = hash_password(body.password)
    if has_known_demo_password(username, password_hash):
        raise HTTPException(400, "demo_password_not_allowed")
    doc = {
        "id": str(uuid.uuid4()), "username": username, "full_name": body.full_name.strip(),
        "password_hash": password_hash, "role": body.role, "active": True,
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(doc)
    return _user(doc)


@router.patch("/users/{id}", response_model=User)
async def update_user(id: str, body: UserUpdate, admin: dict = Depends(require_admin)):
    existing = await db.users.find_one({"id": id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "not_found")

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

    effective_username = upd.get("username", existing.get("username", ""))
    effective_active = upd.get("active", existing.get("active", False))
    effective_hash = upd.get("password_hash", existing.get("password_hash", ""))
    if effective_active and has_known_demo_password(effective_username, effective_hash):
        raise HTTPException(400, "demo_password_not_allowed")

    if id == admin["id"] and (upd.get("active") is False or upd.get("role") == "worker"):
        raise HTTPException(400, "cannot_demote_self")
    doc = await db.users.find_one_and_update(
        {"id": id}, {"$set": upd},
        projection={"_id": 0, "password_hash": 0}, return_document=True,
    ) if upd else {key: value for key, value in existing.items() if key != "password_hash"}
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
    s["price_per_kg"] = money_float(s.get("price_per_kg", 0))
    return AppSettings(**s)


@router.put("/settings", response_model=AppSettings)
async def put_settings(body: AppSettings, _: dict = Depends(require_admin)):
    payload = body.model_dump()
    payload["price_per_kg"] = money_db(body.price_per_kg)
    await db.settings.update_one({"key": "app"}, {"$set": payload}, upsert=True)
    return body
