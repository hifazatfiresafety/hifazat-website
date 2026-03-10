# Hifazat Website + Backend

This package includes:
- `public/index.html` — website
- `server.js` — backend
- `data/inquiries.json` — saved inquiries

## Run
1. Install Node.js 18+
2. Open terminal in this folder
3. Run: `npm start`
4. Open: `http://localhost:3000`

## API
- `GET /api/health`
- `GET /api/inquiries`
- `POST /api/inquiry`

The form is connected to the backend and saves each inquiry into `data/inquiries.json`.
