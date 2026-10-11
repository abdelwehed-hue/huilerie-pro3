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
