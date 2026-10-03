# Dr. HOA – Project Management — Website

One-page marketing site with a consultation request form. Node.js + Express, ready for Railway.

## Run locally

```bash
npm install
npm start
# open http://localhost:3000
```

Without a database, form submissions are saved to `data/leads.json`.

## Deploy to Railway

1. Push this folder to a GitHub repo.
2. In Railway: **New Project → Deploy from GitHub repo** → pick the repo. It builds and starts automatically (`railway.json` sets the start command and `/health` check).
3. **Add a database (recommended):** in the project, click **New → Database → PostgreSQL**. Then in your web service's **Variables**, add `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`. The `leads` table is created automatically on startup. (Without Postgres, leads are stored in a file that is wiped on each redeploy.)
4. **Settings → Networking → Generate Domain** (or add your custom domain).

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection (stores leads permanently) |
| `ADMIN_TOKEN` | Any long secret. View leads at `/admin/leads?token=YOUR_TOKEN` |
| `NOTIFY_EMAIL` | Where new-lead notifications are sent |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Mail server for notifications |
| `SMTP_FROM` | Optional "from" address (defaults to `SMTP_USER`) |
| `COMPANY_NAME` | Name used in server logs and notification emails |

**Gmail example:** `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=you@gmail.com`, `SMTP_PASS=<16-char Google App Password>` (requires 2-Step Verification; a normal password won't work).

Note: Railway blocks outbound SMTP on the free/trial plan. If email doesn't arrive, upgrade to the Hobby plan or switch to an HTTP email API (Resend, SendGrid). Leads are still saved either way.

## Customizing

- **Company name:** "Dr. HOA – Project Management" — to change it, edit `public/index.html` and set `COMPANY_NAME`.
- **Pricing, counties, copy:** all in `public/index.html`.
- **Colors:** CSS variables at the top of `public/index.html` (`--navy`, `--accent`).

## Spam protection

Hidden honeypot field + max 5 submissions per IP per hour.
