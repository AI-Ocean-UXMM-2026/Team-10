# Nookstep

Your space. Your goal. Your next step.

Next.js 16 / React 19 / TypeScript application with Supabase email/password accounts, server-authoritative Study Quests and coin rewards, transactional purchases, and an 8×8 isometric room editor with floor, tabletop and wall decorations.

## Local setup

Use Node.js 22 (see .nvmrc) and npm.

```sh
npm ci
cp .env.example .env.local
# Enter the matching project URL and publishable key privately in .env.local.
npm run dev
```

Open http://localhost:3000. No database writes or migrations run during installation, build or startup. The nonrewarding /demo route is isolated from account data. Never use a secret/service-role key in the application.

## Verification and production

```sh
npm test
npm run lint
npm run build
npx tsc --noEmit
npm start
# In another terminal, against that local production server:
AUTH_SMOKE_ORIGIN=http://localhost:3000 node tests/http-smoke.mjs
RELEASE_SMOKE_ORIGIN=http://localhost:3000 node tests/release-smoke.mjs
```

Browser smoke requires an installed Google Chrome. The build checks all 67 approved PNG hashes and dimensions before compilation. Runtime art is served from public/assets/room; no private asset pack or Mac-only source path is needed. Unit tests use synthetic inputs and do not contact Supabase. Production smoke is read-only, uses no account credentials and blocks external browser traffic. Build checks do not establish hosted functionality.

## Supabase prerequisites — operator approval required

Staging is aegxjctpgsuejgyyyorf (https://aegxjctpgsuejgyyyorf.supabase.co). Development is dyxiixxacytrngsrayuc (https://dyxiixxacytrngsrayuc.supabase.co). Staging has been manually verified by the owner; development migration/catalog state is NOT VERIFIED. Select the intended backend explicitly. Do not reset accounts, relink projects or infer development readiness from staging.

1. Before promotion, inspect the intended project's migration history, grants/RLS/RPCs, catalog and aggregate preservation baseline using supabase/preflight.sql and supabase/catalog/preflight.sql. These older preflights require operator interpretation against the current schema. Use the project's existing recovery/backup process.
2. Review the four supabase/migrations files in timestamp order. Apply only missing migrations after separate approval, preserving profiles, sessions, coins/ledger, inventory, purchases, room placements and revisions. Migrations are not automatically invoked by this package.
3. The legitimate catalog is exactly seven base items from supabase/catalog/mvp-catalog.sql plus fourteen additions from supabase/catalog/task08a-room-additions.sql. Use their explicit approval gates and the documented operator target checks. The scripts reject metadata drift and insert missing rows without repricing or resetting user records. Never run the additions without the fourth migration. No staging test-product seed is included. Do not delete preserved staging records.
4. Verify all 21 approved items, prices, placement permissions and the 31 permitted-surface records on the target. The source manifests in scripts/lib contain only the approved 21 products; their historical QA/proposal names do not authorize hosted execution.
5. Verify get_my_room_layout returns room_save_contract=surfaces-v1, required authenticated-only RPC grants, RLS/account restrictions, revision conflicts and legacy overwrite protection on the selected target. Existing user-data display is not a substitute for direct authorization verification.
6. Keep NEXT_PUBLIC_ROOM_SURFACES_VERIFIED=false until that target is ready. To match verified staging saving, enable it explicitly at build time only after approval and target verification. The client still requires the server capability handshake. A changed NEXT_PUBLIC value requires a new build.

The Shop reads its catalog from the backend; excluding test seeds does not hide pre-existing active test rows on staging. For the final application use a verified target containing the approved production catalog. Review unexpected active rows without deleting or changing them during packaging.

## Vercel checklist — no deployment authorized by this snapshot

- Import the approved private competition repository only after publication approval and remote-content/privacy review. Framework: Next.js; root: repository root; Node.js: 22.x; install: npm ci; build: npm run build; output: framework default (no static export). Source .nvmrc alone does not configure Vercel: explicitly select Node 22.x in project settings.
- Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as a matching pair in each intended Preview/Production scope. No actual values are committed. Never copy staging settings into production implicitly. Set NEXT_PUBLIC_ROOM_SURFACES_VERIFIED per the target-specific gate above.
- Before using real email links, set the Supabase Auth Site URL to the approved final HTTPS origin and allow exact deployed /auth/callback URLs (signup and recovery). If OTP email templates use token_hash, preserve /auth/confirm for email/signup only; recovery uses the PKCE callback. Review email templates/SMTP and production email delivery. Authorize preview callback origins deliberately, avoiding broad production wildcards. No settings were changed by preparation.
- Include the 67 runtime PNGs in the approved Git submission. Keep the checker and scripts/lib hash dependencies in the build context. No Supabase Storage bucket or private asset restoration is required.
- After deployment, test the actual Vercel URL: desktop/mobile visuals and sprites; sign in/register/sign out/recovery; account separation and direct security restrictions; quest start/pause/resume/complete and duplicate rewards; catalog/purchase/ownership/coin accounting; floor/tabletop/wall saving, parent movement, Revert, conflicts and refresh; browser history and honest error/retry feedback. Use authorized accounts and legitimately earned coins.

BUILD SUCCESS DOES NOT ESTABLISH LIVE VERCEL FUNCTIONAL PARITY.

References: [Vercel Next.js](https://vercel.com/docs/frameworks/full-stack/nextjs), [Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [Supabase redirects](https://supabase.com/docs/guides/auth/redirect-urls).

## Rights and submission boundary

Prepared for AI-Ocean-UXMM-2026/Team-10. No original Git history, actual environment files, credentials, user data, private documents, staging runners/seeds or original asset archives are included. Runtime art: ToffeeCraft, Cozy Room - Isometric (https://toffeecraft.itch.io/cozy-room-pixel-asset-pack), owner-confirmed Premium application use. Only the 67 curated application PNGs are packaged locally. This does not license them for standalone reuse or resale. Permission for sharing individual PNGs with repository collaborators/judges remains an owner pre-publication decision. See THIRD_PARTY_NOTICES.md for dependency notices. No general open-source licence for Nookstep or its art is granted by this snapshot.
