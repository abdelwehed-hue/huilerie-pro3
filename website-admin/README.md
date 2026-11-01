# Oro Verde Admin

Separate private CMS frontend. Configure `VITE_CMS_API_URL` at build time to point to the independent CMS API service.

- Static admin UI: noindex/nofollow.
- Authentication: API-issued JWT, 8-hour expiry.
- Content, news, products, and media are persisted by the API in the dedicated `oroverde_cms` database.
- Product catalogue management does not enable ecommerce. No cart, checkout, order, or payment functionality is included.
