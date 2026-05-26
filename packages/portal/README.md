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

- `WEB_PIVOTAL_API_BASE_URL` runtime container env, recommended for deployed nginx images.
- `VITE_WEB_PIVOTAL_API_BASE_URL` build-time fallback.
- `VITE_AUDIT_API_BASE_URL` (legacy fallback)

The Docker image writes `/config.js` on startup from `WEB_PIVOTAL_API_BASE_URL`.
When it is unset, the portal falls back to build-time Vite env and then
`http(s)://<current-host>:3202`.

## Features

- Side menu navigation: Inbound/Outbound + Parties/Quotes/Transfers
- Criteria forms with pagination and ordering
- Search results summary and record cards
- JSON viewer for `request` / `response` / `error` / `fspError`
