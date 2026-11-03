# Huilerie Pro — معصرة زيتون (SPEC)

Bilingual (FR default / AR with RTL) olive-oil mill management app. No bookings.

## Auth & roles
- httpOnly cookie `olive_session` (JWT, 7d). Routes `/api/auth/login|logout|me`.
- Roles: `admin` (everything incl. revenue, users, tariff, delete loads) and `worker` (intake, oil entry, search, lab; amounts/prices returned as null).
- Startup seeds (only if users collection empty): admin/admin123, ouvrier/ouvrier123. Default price 0.18 DT/kg.
- Deactivated users cannot log in (403 account_disabled) and existing sessions get 401.

## Data model (Mongo)
- users {id, username(lowercase, unique), full_name, password_hash(pbkdf2), role, active, created_at}
- loads {id, code (YYMMDDHHMM in Africa/Tunis, suffix `-2`, `-3` if same minute), client_name, phone, olive_kg, oil_kg|null, day, created_at, created_by, price_per_kg (snapshot)}
  - status = done if oil_kg set; yield_pct = oil/olive*100; amount = olive_kg*price_per_kg (admin only)
- lab {id, load_id, code, client_name, acidity, peroxide, k232, k270, oil_content_pct, classification (extra_vierge|vierge|lampante — auto from thresholds unless given), notes, created_at, created_by}
- settings {key:"app", price_per_kg}

## API (/api)
POST /loads, GET /loads?q=&status=pending|done, GET /loads/by-code/{code}, PATCH /loads/{id}/oil, DELETE /loads/{id} (admin)
GET /stats (revenue fields null for workers), GET/POST /lab, DELETE /lab/{id} (admin)
GET/POST /users, PATCH /users/{id} (admin; full_name/role/active/password), GET/PUT /settings (admin)

## Pages
/login, / (dashboard KPIs + chart + recent), /intake (form → ticket with code, print), /search?code=, /loads (table, oil dialog), /lab, /settings (admin: users tab + tariff tab)

## v2 additions
- **SMS (MOCKED)**: `lib/sms.py` logs bilingual FR+AR messages to `sms_log` with status `simulated` on load creation (kind `arrival`) and when oil is first entered (kind `ready`). No provider wired yet. GET /api/sms; page /sms.
- **Revenue report (admin)**: GET /api/reports/revenue?period=daily|monthly&start=&end= (defaults: daily last 30 days, monthly from Jan 1), plus `.xlsx` (openpyxl) and `.pdf` (reportlab) downloads. Page /reports.
- **Client book**: GET /api/clients?q= (grouped by phone; phone stored without spaces), GET /api/clients/{phone} history with loads + lab. Page /clients?phone=.
- **Lab certificate**: GET /api/lab/{id}/certificate → analysis + load + mill info. Printable page /certificate/:id.
- Settings now hold mill_name, mill_address, mill_phone alongside price_per_kg (PUT /api/settings full body).

## Worker revenue (Reports page, admin only)
- GET /api/reports/workers?period=&start=&end= -> per-day rows + per-worker totals; revenue attributed to the user who logged the arrival. Shown in Reports page "Recettes par ouvrier" section.
- SMS stays in SIMULATED mode until Twilio keys are added to backend/.env.

## UI changes (latest)
- Navigation: fixed bottom icon bar (BottomNav in AppShell) replaces the sidebar; brand moved to header.
- Dashboard embeds IntakePanel (components/IntakePanel.tsx, shared with /intake).
- Client name field suggests previous clients via GET /api/clients?q=; picking one fills name + phone.
- Loads page: delete button removed from UI (only oil entry action remains). Backend DELETE /loads/{id} still exists (admin).

## Load cancellation (admin)
- POST /api/loads/{id}/cancel {reason (3-300 chars)} -> sets cancelled, cancel_reason, cancelled_at, cancelled_by. Load.status = "cancelled". 409 load_cancelled on re-cancel / oil entry / lab creation. Workers 403.
- Cancelled loads stay listed (Loads filter "cancelled") but are excluded from /stats, revenue + worker reports (PDF/Excel), client summaries and client history totals.
## Intake extras
- Picking a suggested client shows a quick history card (GET /api/clients/{phone}): count, olives, oil, avg yield, last 6 loads.
- Reception ticket has a QR code (qrcode.react) -> {origin}/search?code=CODE (requires login).
## Twilio live SMS
- Automatic: add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER (or TWILIO_MESSAGING_SERVICE_SID) to backend/.env and restart backend -> mode switches to "live". 8-digit numbers get +216 (SMS_COUNTRY_CODE).

## Delivery + pickup reminder
- POST /api/loads/{id}/deliver (any user; 409 oil_not_ready / already_delivered / load_cancelled). Status "delivered". Loads filter has "delivered".
- set_oil stamps oil_ready_at on first oil entry. lib/reminders.py loop (every REMINDER_CHECK_MINUTES=30) sends ONE "reminder" SMS when oil ready >= REMINDER_HOURS (48h) and not delivered/cancelled; sets reminder_sent_at. Admin manual trigger: POST /api/sms/reminders/run. Template: settings.sms_reminder_template.
## Twilio admin config
- GET/PUT/DELETE /api/sms/twilio (admin). PUT verifies creds against Twilio (GET Accounts/{sid}.json) and stores them in settings key "twilio" (DB overrides .env). Empty auth_token on PUT keeps stored token. POST /api/sms/test {phone} sends a test SMS (logged kind "test").
## Cancellations log
- GET /api/loads/cancellations?month=YYYY-MM (admin) -> page /cancellations (nav "Annulations").
## QR scan
- Header "Scanner QR" button opens camera (html5-qrcode); ticket QR URL or raw code -> /search?code=.

## Layout (latest)
- Header: brand left, single language switch button, user name/role, logout icon. No header search.
- Dashboard (matches user mockup): greeting + "Nouvelle réception" button (opens right Sheet with IntakePanel), dark quick-search card with QR scan icon, 4 KPI cards (revenue for admin / pending for worker), "Arrivages du jour" table.
- Loads: admin delete icon restored (DELETE /api/loads/{id}) alongside cancel.
## Client edit/delete (admin)
- PUT /api/clients/{phone} {client_name, phone} renames across all loads. DELETE /api/clients/{phone} deletes all their loads + lab + sms_log.

## Update — seasons, varieties, pressing status, reprint
- Season (campaign) = 1 Oct → 30 Apr (May–Sep stays in the ending season). `lib/season.py`; GET /api/seasons, PUT /api/seasons/active {season:""=auto|"YYYY-YYYY"} (admin). Loads list (/loads?season=…, "all" bypasses) and /stats totals are scoped to the active season. Settings → "Campagne" tab.
- Varieties: settings.app.varieties; GET/PUT /api/varieties. Load stores `variety`, `bags`, `notes`, `created_by_name`; all printed on the reception ticket (components/ReceptionTicket.tsx, also ReprintDialog).
- Statuses: pending (Reçu) → pressing (En cours de pression) → done (Terminé, needs oil) → delivered (Livré). PATCH /api/loads/{id}/status. Intake can start as pending or pressing.
- Search page: code / phone / name (`/loads?season=all&q=`), big QR scan button, status dropdown, "Réimprimer le reçu". Dashboard quick search routes 10-digit codes to ?code=, else ?q=.
- New client: POST /api/clients (db.clients) → appears in intake client dropdown before any load.
- Reports: `worker` filter on /reports/revenue|workers|pdf|xlsx and /loads?worker=; Reports page lists that worker's loads.
- Users: PATCH /api/users/{id} supports username; DELETE /api/users/{id} (not self, loads kept).

## Écran TV
- Public page `/tv` (no login, fixed link) — shows only receipt codes + finish time of today's Terminé loads (oil entered today, not delivered/cancelled). No client names/phones.
- Live: WebSocket `/api/tv/ws` (pushes on change, checked every 2 s); falls back to polling GET `/api/tv/board` every 3 s, retries WS every 15 s.
- Admin-only control page `/tv-admin` (nav "Écran TV"): hide/show number, remove/restore from screen via PATCH `/api/tv/items/{id}`. State stored in separate `tv_state` collection — loads are never modified.

## Seasons v2 (season_id) + season codes
- Every load stores permanent `season_id` = active season at creation (lib/season.py). Startup migration `migrate_season_ids` only ADDS missing season_id (loads by date; lab/sms_log from their load). Backups in /app/backups/.
- New receipt codes: season prefix (2026-2027 → "2627") + per-season counter from 100 (db.counters `load_seq:<season>`): 2627100, 2627101… Old 10-digit codes unchanged.
- Active season: Paramètres → Campagne (auto = by date, new season every 1 Oct; or pick/create e.g. 2025-2026 via POST /api/seasons) or header selector (admin; workers see badge). Changing it never moves data.
- Filtered by active season: /loads (list, search q, by-code), /stats, /lab list + create lookup, cancellations, reports (revenue/workers/pdf/xlsx), sms log, client history & client totals. Carnet clients list is global (clients of other seasons appear with 0 totals).
- Lab: POST /api/lab upserts — if the receipt already has an analysis, the latest one is updated (no duplicate). Lab page pre-fills the form with the existing analysis when the code is typed or clicked in the table.
