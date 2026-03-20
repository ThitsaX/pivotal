# Pivotal Audit Portal

Vue + Tailwind UI for searching audit data from `apps/web-pivotal`.

## Run

```bash
cp .env.example .env
npm install
npm run dev
```

Default URL: `http://localhost:4173`

## Environment

- `VITE_WEB_PIVOTAL_API_BASE_URL` (recommended)
- `VITE_AUDIT_API_BASE_URL` (legacy fallback)

## Features

- Side menu navigation: Inbound/Outbound + Parties/Quotes/Transfers
- Criteria forms with pagination and ordering
- Search results summary and record cards
- JSON viewer for `request` / `response` / `error` / `fspError`
