# Oro Verde CMS

Independent content-management application for Oro Verde. This branch contains the CMS API and its private administration interface. The public website integration is intentionally deferred; this CMS does not change or deploy the public website.

## Architecture

- `cms-api/`: Node.js + Express API.
- `website-admin/`: React + Vite administration interface.
- MongoDB database: `oroverde_cms` (separate from the olive-mill operations database).
- Media: MongoDB GridFS bucket `site_media`; uploaded images are not stored on Render's ephemeral filesystem.
- Supported content languages: French (`fr`), Arabic (`ar`), and English (`en`).
- Scope: homepage/site content, news, products, and media library. Product publication is informational only. No shopping cart, checkout, orders, or payments are implemented.

## Render services

| Service | Branch | Purpose |
|---|---|---|
| `oro-verde-cms-api` | `website/cms-foundation` | CMS API |
| `oro-verde-admin` | `website/cms-foundation` | Admin interface |

The public website and the mill-management application are separate services and are not part of this deployment.

## Environment variables

### CMS API

Configure these in the Render environment for `oro-verde-cms-api`:

- `MONGODB_URI`: MongoDB Atlas connection string. Use the dedicated CMS database; the API selects database `oroverde_cms`.
- `JWT_SECRET`: long, random signing secret. Never commit or share it.
- `FRONTEND_ORIGIN`: exact admin origin, e.g. `https://oro-verde-admin.onrender.com`.
- `CMS_SETUP_KEY`: temporary setup key used only to create the first administrator. It can be removed after the first administrator has been created; the setup endpoint then returns 503. Do not remove it before setup is complete.

### Admin interface

Configure this in the Render environment for `oro-verde-admin`:

- `VITE_CMS_API_URL`: API origin, e.g. `https://oro-verde-cms-api.onrender.com`.

Do not put secrets in frontend environment variables.

## First administrator setup

1. Set `MONGODB_URI`, `JWT_SECRET`, `FRONTEND_ORIGIN`, and a temporary `CMS_SETUP_KEY` on the API service.
2. Set `VITE_CMS_API_URL` on the admin static site.
3. Deploy both services.
4. Open the admin interface and choose **Configuration initiale**.
5. Enter the temporary setup key, administrator email, and a unique password of 12–128 characters.
6. After the account is created, remove `CMS_SETUP_KEY` from the API service and redeploy/restart the API. The first-admin endpoint is protected by a unique database index and cannot create a second administrator.
7. Sign in normally. Admin JWT sessions expire after 8 hours.

Never put credentials or environment-variable values in source control or chat.

## API overview

Public read-only endpoints:
- `GET /health`
- `GET /api/public/content`
- `GET /api/public/news`
- `GET /api/public/products`
- `GET /api/public/media/:id`

Administrator endpoints (Bearer JWT required, except initial setup and login):
- `POST /api/admin/setup` — one-time first-admin setup.
- `POST /api/admin/login`
- `GET /api/admin/me`
- `PUT /api/admin/password` — change the current administrator password (current password required)
- `GET/PUT /api/admin/content`
- `GET/POST /api/admin/news`, `PUT/DELETE /api/admin/news/:id`
- `GET/POST /api/admin/products`, `PUT/DELETE /api/admin/products/:id`
- `GET/POST /api/admin/media`, `DELETE /api/admin/media/:id`

Uploads are limited to 8 MiB and JPEG, PNG, WEBP, or AVIF. The API checks file signatures rather than trusting the browser-supplied MIME type. Media referenced by a news article or product cannot be deleted until that reference is changed.

## Local development

API:
```bash
cd cms-api
npm install
# Set MONGODB_URI, JWT_SECRET, FRONTEND_ORIGIN and (only for setup) CMS_SETUP_KEY
npm start
```

Admin:
```bash
cd website-admin
npm install
# Set VITE_CMS_API_URL
npm run dev
```

## Automated checks

GitHub Actions runs JavaScript syntax checks, CMS helper unit tests, and the admin production build on pushes and pull requests to `website/cms-foundation`.

Run the checks locally:

```bash
cd cms-api
npm test
node --check server.js
cd ../website-admin
npm install
npm run build
```

## Operational safety

- Never point this CMS at the mill operations database.
- Never deploy this branch to the mill application or the public website.
- Back up MongoDB before schema migrations or destructive maintenance.
- Verify both Render deployments and API logs after changes.
- A successful frontend build is not an end-to-end test. Authenticated CRUD and persistence still require a real administrator account and a controlled test record.
