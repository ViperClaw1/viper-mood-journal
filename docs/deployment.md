# Deployment (Railway + Vercel)

Backend variables mirror [`backend/.env.example`](../backend/.env.example). Set them in **Railway → your service → Variables**.

## Railway checklist

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` | Usually injected by Railway Postgres plugin |
| `JWT_SECRET` | Long random string (required) |
| `NODE_ENV` | `production` |
| `ANTHROPIC_API_KEY` | Claude API key |
| `GOOGLE_CLIENT_ID` | If using Google login |
| `GOOGLE_CLIENT_SECRET` | If using Google login |
| `GOOGLE_CALLBACK_URL` | `https://<your-railway-host>/auth/google/callback` (must match Google Cloud console) |
| `FRONTEND_ORIGIN` | Vercel URL(s), comma-separated if multiple; required for CORS + OAuth redirect base |
| `PUBLIC_API_URL` | Public Railway URL (no trailing slash); used for absolute avatar URLs |
| `MAIL_FROM` | Verified sender (e.g. Resend domain) |
| `SMTP_HOST` | e.g. `smtp.resend.com` |
| `SMTP_PORT` | `587` (or `465` if you use TLS-only) |
| `SMTP_USER` | Resend: `resend` |
| `SMTP_PASS` | Resend API key |
| `PASSWORD_RESET_FRONTEND_URL` | `https://<your-vercel-app>/reset-password` |

After changing variables, **redeploy** the Railway service.

## Vercel (frontend)

- Set `VITE_API_URL` to your Railway API origin (e.g. `https://your-api.up.railway.app`) if the app does not infer production API from hostname.

## Production smoke test (manual)

1. Sign up / register a new user  
2. Log in (email/password and Google if enabled)  
3. Journal: create entry, list history, delete  
4. Settings: profile, theme, password change, avatar upload  
5. Forgot password → email link → reset password (needs SMTP + verified domain)

## Local Docker

See [`docker-compose.yml`](../docker-compose.yml) comments and [docker-troubleshooting.md](./docker-troubleshooting.md). Copy [`.env.example`](../.env.example) to `backend/.env`, then `docker compose up --build` from the repo root.
