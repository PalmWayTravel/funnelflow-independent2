# FunnelFlow (független verzió)

Saját CRM: React (Vite) felület + Supabase háttér (Postgres, RLS, Auth, Edge Functions, pg_cron) + Resend e-mail + Stripe.
Nincs Base44-függés.

- `src/api/base44Client.js` — kompatibilitási réteg: a felület régi `base44.entities/auth/functions` hívásai Supabase-re mennek.
- `supabase/functions/` — háttérfüggvények (Deno). `_shared/base44.ts` a szerver oldali kompatibilitási réteg.
- `supabase/migrations/` — adatbázis-változások (a séma a Supabase projektben él).
- `.github/workflows/deploy-functions.yml` — minden push a `main`-re telepíti a függvényeket (kell hozzá a `SUPABASE_ACCESS_TOKEN` GitHub-titok).

## Titkok (Supabase → Edge Functions → Secrets)
`RESEND_API_KEY`, `MAIL_FROM`, `MAIL_FROM_NAME`, `MAIL_REPLY_TO`, `APP_URL`, `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN`, `META_ACCESS_TOKEN`, `ANTHROPIC_API_KEY` (opcionális), `PORTAL_URL/PORTAL_APP_ID/PORTAL_SECRET` (amíg a Portal külön fut).

## Felület telepítése (Cloudflare Pages)
Build: `npm run build`, kimenet: `dist`, környezeti változók: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (lásd `.env.example`).
