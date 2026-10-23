# Nookstep

**Your space. Your goal. Your next step.**

Nookstep is a gamified study companion for students and independent learners. Turn a vague intention into a clear goal, spend time on a focused Study Quest, reflect on what you did, and leave a useful next step for tomorrow. Eligible completed quests earn coins to make your personal study room feel like your own.

A student-developed functional MVP by **Sirens & Knights** for the **UXMM Innovation Competition**.

## Live Demo

**[Live Demo: https://nookstep.vercel.app](https://nookstep.vercel.app)**

The application is hosted on Vercel and uses Supabase for authentication and persistent data. You can also [try the account-free demo](https://nookstep.vercel.app/demo), which uses sample input and an accelerated timer. It awards no real coins and does not save account progress.

Registration email delivery is currently restricted; read [Demo Access & Current Limitations](#demo-access--current-limitations) before creating an account.

## What Problem Does Nookstep Solve?

“I should study” is often too vague to act on. Nookstep helps learners choose a specific finish line, focus for a manageable period, and remember where to begin next time. Room customization provides a small reward for returning to study.

Learning Checks are optional self-reflections. Nookstep is not an AI tutor and does not automatically evaluate learning; a completed timer records study activity, not proof of understanding or attention.

## Key Features

| Area | Implemented in the MVP |
| --- | --- |
| Study Quests | Choose a subject and topic, set a concrete finish line, select **Understand, Practice, Remember, or Review**, and configure a 5–120 minute focus duration. Pause, resume, cancel, or request completion when the timer reaches its finish. |
| Reflection & continuity | Complete or skip an optional **Learning Check**, save a **Next Step**, and use it to prepare a new, editable quest. |
| Rewards | Eligible completed quests earn coins after server-side validation. Balances and reward transactions persist in the database. |
| Shop & inventory | Spend earned in-app coins on **21 approved products** across Furniture, Decorations, and Wall Decorations. Purchased ownership persists across sessions. |
| My Room | Customize an interactive **8×8 isometric room**: place and move furniture, rotate supported items, arrange tabletop decorations and wall decor, then save the layout. |
| Accounts | Supabase email/password authentication with personal study progress, inventory, balances, and room data. |

## Product Preview

The [landing page](https://nookstep.vercel.app) shows the furnished example room. The [interactive demo](https://nookstep.vercel.app/demo) previews a sample study session and room editing without an account.

Product screenshots are not included in this submission. The PNGs under `public/assets/room/` are runtime sprites, not screenshots of application use.

## Technology Stack

- **Next.js 16**, **React 19**, and **TypeScript** for the application.
- **Supabase Authentication** and cookie-based server-side session handling.
- **Supabase PostgreSQL** for study sessions, rewards, purchases, inventory, and room layouts.
- **Vercel** for hosting; **Node.js 22** and npm for local development.

## Demo Access & Current Limitations

The current backend uses Supabase's **default authentication email provider**, with a Dashboard allowance of **2 authentication emails per hour across the project**. Signup confirmation, confirmation resends, and password-recovery emails share this restrictive email allowance. The maintainer has observed email-rate-limit errors during both signup and password recovery.

This is an **email-sending restriction**, not a limit of two registered users or the monthly-active-user allowance. The default service may also restrict eligible recipients, so some testers may not receive a confirmation email. Existing verified accounts can normally continue signing in without requesting another email. See [Supabase's default email-service restrictions](https://supabase.com/docs/guides/auth/auth-smtp).

Current confirmation links use the default **PKCE callback flow**. Open the latest confirmation link in the **same browser and device** that requested registration or a resend. Cross-device verification is not supported by the currently configured flow. Forgot Password may also be limited by email sending and requires its requesting browser/device; its live recovery journey remains a separate pending check. See [Supabase's PKCE limitations](https://supabase.com/docs/guides/auth/sessions/pkce-flow#limitations).

Custom SMTP and a custom confirmation-email template are **not configured**. The source includes the registration journey **Register → Check Email → Email Verified → Continue to Sign In → Home** in commit `490ad6c`. This identifies implemented source behavior, not a claim that the complete live email journey has been reverified after deployment.

## Getting Started — Local Development

Use **Node.js 22** (see [.nvmrc](.nvmrc)) and npm. You need your own Supabase project or an explicitly authorized backend with the schema and catalog described below.

```sh
git clone https://github.com/AI-Ocean-UXMM-2026/Team-10.git
cd Team-10
npm ci
cp .env.example .env.local
```

Enter your matching project settings privately in `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
NEXT_PUBLIC_ROOM_SURFACES_VERIFIED=false
```

The URL and publishable key must belong to the **same intended Supabase project**. Public project URLs and publishable keys are application configuration, not privileged credentials. Never put a Supabase secret or service-role key in a `NEXT_PUBLIC_` variable, and never commit actual environment files.

Keep `NEXT_PUBLIC_ROOM_SURFACES_VERIFIED=false` until the selected backend has been verified for expanded room saving. Enable it at build time only after that check; the client also requires the server's `surfaces-v1` capability handshake. Changing a `NEXT_PUBLIC_` value requires rebuilding.

```sh
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Installation, build, and startup do not apply migrations or seed the database. For email flows, allow the exact local `/auth/callback` URL in your own backend's Auth redirect settings; do not change a shared production project's settings implicitly.

## Testing & Verification

```sh
npm test
npm run lint
npm run build
npx tsc --noEmit
npm start
```

With the local production server running, these additional checks exercise signed-out routes and release assets:

```sh
AUTH_SMOKE_ORIGIN=http://localhost:3000 node tests/http-smoke.mjs
RELEASE_SMOKE_ORIGIN=http://localhost:3000 node tests/release-smoke.mjs
```

- Unit tests use synthetic inputs and controlled external-service responses; they do not test real email delivery.
- The release smoke script requires installed Google Chrome, accepts only a local server, and blocks external browser traffic.
- The build checks the **67 curated runtime PNGs** against recorded hashes and dimensions.
- A successful build or local smoke test does not establish complete hosted authentication, database security, email delivery, or deployment parity.

## Technical Architecture and Database Setup

| Location | Responsibility |
| --- | --- |
| `src/app/` | Public and account routes, authentication Server Actions, and email callback handlers. |
| `src/components/` | Study workspace, account forms, shop, inventory, and room interface. |
| `src/lib/` | Supabase clients, auth policies, Study Quest models, and room rules. |
| `supabase/migrations/` | Schema, profile provisioning, access rules, and transactional RPC definitions. |
| `supabase/catalog/` | Guarded catalog setup and catalog preflight SQL. |
| `tests/` and `scripts/` | Automated checks, local smoke scripts, and runtime-asset validation. |

The server validates Study Quest timing and rewards. Transactional RPCs handle purchases and coin accounting; room-saving RPCs check ownership, supported placements, and layout revisions. Row-level security and authenticated RPC permissions protect personal data. The browser's displayed timer does not authorize rewards.

### Schema and catalog

For a new backend, review the four migrations in timestamp order:

1. [Schema and read access](supabase/migrations/20261021000100_schema_and_read_access.sql)
2. [Profile provisioning](supabase/migrations/20261021000200_profile_provisioning.sql)
3. [Transactional operations](supabase/migrations/20261021000300_transactional_operations.sql)
4. [Natural room placement](supabase/migrations/20261022000100_natural_room_placement.sql)

Then review the guarded catalog scripts: [seven base products](supabase/catalog/mvp-catalog.sql) and [fourteen additions](supabase/catalog/task08a-room-additions.sql). Their operator approval gates are intentional. The additions require the natural room-placement migration; these scripts are not automatically run by the application.

For an existing backend, inspect migration history, permissions, catalog metadata, and data-preservation baselines first. Apply only missing changes after explicit operator approval and an adequate backup covering application data and Auth identities. Do not reset or reseed an existing user database. Retain authenticated-only RPC grants, row-level security, ownership checks, revision conflicts, and legacy-client overwrite protection.

The maintainer previously verified the application backend's completed upgrade: all four migrations, **21 approved products**, **29 permitted-surface records**, the authenticated **`surfaces-v1`** contract, and preservation of existing application data. These are reported release findings, not new hosted checks performed for this documentation update. A verified backup and restore rehearsal is still outstanding.

For another deployment, use the repository root, the Next.js framework preset, Node.js 22, `npm ci`, and `npm run build`. Configure the matching public environment variables in the intended deployment scope, and verify backend capabilities before enabling expanded saving. Hosted database and Auth configuration are separate from application deployment.

## Team & Competition

**Team:** Sirens & Knights

**Competition:** UXMM Innovation Competition

Nookstep is a student-developed functional MVP. Its focus is a clear study loop and a personal space that grows through eligible study activity.

## Third-Party Assets and Attribution

Room artwork: **ToffeeCraft — Cozy Room: Isometric**, available from the [asset creator](https://toffeecraft.itch.io/cozy-room-pixel-asset-pack). The 67 curated sprites are used under the purchased licence; the project owner has confirmed permission for their inclusion in this public application repository.

The artwork is **not open-source** and is not offered as a standalone asset collection. This repository grants no blanket open-source licence for Nookstep or its artwork. Dependency licence texts and third-party attribution are retained in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); each dependency remains subject to its own terms.
