# Oro Verde CMS API

Independent content-management API for the Oro Verde corporate website.

## Security and deployment
- Separate MongoDB database: `oroverde_cms`; never use the mill application's `huilerie-pro3` database.
- Configure `MONGODB_URI`, `JWT_SECRET`, `CMS_SETUP_KEY`, and `FRONTEND_ORIGIN` as Render secrets/environment variables.
- Create the first administrator once through `POST /api/admin/setup`, then remove/rotate `CMS_SETUP_KEY` in Render.
- Admin sessions use signed JWTs with an 8-hour expiry; login and setup endpoints are rate-limited.
- Media files are stored in MongoDB GridFS, not on the ephemeral Render filesystem.
- Commerce, checkout, orders, and payment endpoints are intentionally not implemented.

## Run locally
```bash
npm install
cp .env.example .env
npm start
```
