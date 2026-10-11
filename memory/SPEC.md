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
