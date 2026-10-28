# V3l0city Web

The web project is an independent Next.js App Router application. Public pages
and the simulator work without a provider. Its retained legacy account/social
adapter uses Supabase contracts and a distinct `v3l0city-web` IndexedDB database;
that adapter has not yet acquired owned v2 backend parity. It does not import
Expo or native runtime modules. Owned v2 invite, account, support and legal
surfaces remain tracked separately in #81.

## Local development

1. Use the root `.node-version`, then run `npm ci` in this directory; its lockfile
   and dependencies are separate from the native app.
2. Run `npm run dev` for public pages and the synthetic simulator. Hosted
   accounts are optional. The ordinary `dev`, `build`, and `start` commands
   retain a compatibility bridge from repository-root public Expo Supabase
   configuration; explicit `NEXT_PUBLIC_SUPABASE_*` values override it. Never
   put a service-role/secret key in this project.
3. Test real legacy account flows only against an authorized isolated provider
   environment. Do not apply migrations or alter retained hosted data as part
   of a public-site check. See the historical compatibility checklist below
   for the old provider requirements.

Useful checks:

```sh
npm run typecheck
npm run lint
npm test
npm run build:ci
npx playwright install chromium
npm run test:e2e
```

`build:ci` uses synthetic public metadata and no hosted auth/CAPTCHA credentials.
Run it immediately before E2E. The test command requires `.next/BUILD_ID` and
serves that production artifact with `next start` on `127.0.0.1:3100`; it never
reuses a developer server. Ordinary `npm run build`/`npm run start` keep existing
deployment behavior. Linux CI installs Chromium dependencies with
`npx playwright install --with-deps chromium`.

The desktop/mobile-emulation tests block cross-origin traffic and exercise
public navigation, metadata, theme, demo boundaries and unavailable auth. Their
retained HTML/JUnit reports, failure traces and screenshots contain synthetic
public journeys only. They do not prove hosted auth, owned connected features,
physical mobile behavior or production readiness.

## Historical legacy web launch checklist

This records the retained provider-specific web deployment. It is not an owned
v2 hosting decision or instruction to migrate live accounts; final retirement
waits for verified data and feature parity.

- Create a Vercel project with `web/` as its root directory. Set every variable in `.env.example`, including the legal entity identity, public contact addresses, legal effective date, and terms version. Vercel production builds fail if those required legal values are absent.
- Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` directly in Vercel; the repository-root Expo `.env` fallback is local-development only. Never use `SUPABASE_SERVICE_ROLE_KEY` in this project. The service role remains confined to Supabase Edge Function infrastructure.
- In Supabase Auth, set the production Site URL and specific production/preview redirect URLs, enable email confirmation and production SMTP, set an appropriate password policy/rate limit, and configure Turnstile in the Dashboard. Set the matching public Turnstile site key in Vercel.
- Deploy the migrations in `supabase/migrations/`, then deploy `delete-account` and `report-profile`. Confirm new tables are exposed to the Data API only with their RLS policies enabled.
- Validate RLS with separate accounts: direct profile reads must return only the signed-in owner; legal acceptances and reports must be owner-only; all social data flows must use their Edge Functions.
- Have qualified counsel finalize the legal entity information, retention schedule, international-transfer terms, governing-law/dispute provisions, vendor agreements, and policy language for the actual launch jurisdictions. These pages are implementation-ready disclosures, not legal advice or a compliance guarantee.
- Manually test current iOS Safari, Android Chrome, and desktop Chromium. In particular, verify phone-only manual Start/Stop, foreground/lock interruption notices, no desktop drive controls, cloud restore, consent withdrawal, deletion, and CSP/CAPTCHA behavior.

## Product boundaries

The browser tracker only starts after an explicit user action. It stores derived speed samples and trip summaries, not persisted raw route coordinates. The page must remain open, visible, and unlocked. Desktop is read-only for driving data. The web release intentionally omits auto-start, background tracking, mount guidance, native app settings links, widgets, native push setup, and driving-screen social actions.

## Marketing appearance preference

The public landing page includes an accessible appearance menu with System, Light, and Dark choices. System is the default and follows the browser or operating-system `prefers-color-scheme` setting. The selection is saved only in that browser’s local storage under `v3l0city-marketing-theme`; it is not tied to an account, sent to Supabase, included in analytics, or dependent on a browser permission. A small pre-hydration script applies the stored or system-resolved palette before the first paint, avoiding a light/dark flash. The control appears only on the landing page, but the stored preference applies to the simulator, legal pages, authentication screens, and authenticated product routes.

## Navigation, motion, SEO, and accessibility

The public header and authenticated dashboard each switch to an accessible mobile menu at small widths. The menu traps page scrolling while open, moves keyboard focus to its first link, restores focus to the trigger on Escape, and exposes its state with `aria-expanded`. Public links also expose the current page with `aria-current`.

Framer Motion provides the mobile-menu transition and restrained hero/content reveals. Every animated path honors `prefers-reduced-motion`; the existing visual effects are reduced to an immediate, static presentation for people who request it.

Public pages have route-specific titles, descriptions, canonical URLs, Open Graph/Twitter metadata, and a shared social image. The landing page publishes Organization, WebSite, SoftwareApplication, and FAQ structured data. Authenticated, authentication, and report routes are `noindex`; they are excluded from the sitemap and protected by `robots.txt` where appropriate. Browser tests cover keyboard mobile navigation, metadata, structured data, appearance persistence, and the product demo boundary.

## Native app download links

The landing hero includes platform-specific iPhone/iPad and Android download badges in the same instrument-panel visual system as the web experience. Their defaults are deliberately non-production `example.com` placeholders. Before launch, set `NEXT_PUBLIC_IOS_APP_URL` to the App Store listing and `NEXT_PUBLIC_ANDROID_APP_URL` to the Google Play listing in Vercel; the links open in a new tab.
