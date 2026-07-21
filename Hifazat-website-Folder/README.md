# HIFAZAT Fire Safety Solutions — Website + Backend

This package includes:
- `public/` — the full website (homepage, 9 commercial service pages, 4 informational/compliance pages, styles, scripts, images)
- `server.js` — backend (inquiry API, Google Sheets sync, admin API)
- `.gitignore` — excludes `data/` (runtime customer inquiries) and `node_modules/` from version control

## Run locally
1. Install Node.js 18+
2. Open a terminal in this folder
3. Run: `npm install` (if you have any dependencies) then `npm start`
4. Open: `http://localhost:3000`

## Environment variables (set these in Render, not in code)
| Variable | Purpose |
|---|---|
| `APPS_SCRIPT_URL` | Google Apps Script Web App URL — inquiries sync here into your Google Sheet |
| `BUSINESS_PHONE` | Defaults to `03091666636` if unset |
| `ADMIN_TOKEN` | Secret token for admin API access. **Not set by default — admin routes are fully locked (401) until you set this.** See "Admin access" below. |

## API
- `GET /api/health` — public health check
- `POST /api/inquiry` — public, used by the website's inquiry form. Saves the lead locally and syncs it to your Google Sheet via `APPS_SCRIPT_URL`.
- `GET /api/inquiries`, `GET /api/admin-dashboard`, `GET /api/failed-inquiries`, `POST /api/resend-failed-leads` — **admin-only**, require an `x-admin-token` header matching `ADMIN_TOKEN`. Return 401 if `ADMIN_TOKEN` is not set.

## Admin access
The old in-page admin panel (accessible via a `?admin=` URL parameter) has been removed for security — it exposed all customer leads to anyone who found the URL, with no real authentication.

To view leads now, you have a few options:
1. Check your Google Sheet directly (leads sync there automatically on every submission).
2. Set `ADMIN_TOKEN` in Render's environment variables, then query the admin API with that token in an `x-admin-token` header (e.g. via a tool like Postman, or a small internal script).
3. Ask for a proper authenticated admin dashboard to be built.

## Data
The form saves each inquiry into `data/inquiries.json` on the server. This file is **not** included in this package and is excluded from version control (`.gitignore`) because it contains real customer names, phone numbers and addresses. It persists on Render's filesystem between deploys as long as you don't wipe the instance.
