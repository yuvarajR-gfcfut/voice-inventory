# Voice-Based Inventory Management — Milestone 2

## What this milestone delivers

Milestone 2 transitions StockSathi from a frontend prototype into a complete, hardened voice-first inventory system tailored for Indian kirana store owners. It provides instant stock updates, regional voice processing, and proactive replenishment alerts without cloud subscription costs.

- **Multi-Tenant Accounts**: Secure email/password authentication using Supabase Auth, isolated via PostgreSQL Row Level Security (RLS) policies on all tables.
- **Atomic Stock Ledger**: Inward, outward, and count adjustments handled through atomic database functions (`apply_stock_movement`, `undo_stock_movement`), guaranteeing non-negative stock and idempotent writes.
- **Unit Conversion Engine**: `src/lib/units.js` normalizes `kg`, `l`, and `pcs` base units, supporting defaults (`bag` = 50kg, `quintal` = 100kg, `dozen` = 12pcs, container units) and per-product conversion overrides while enforcing strict dimension compatibility and guarding unresolved regional units (`pav`/`pao`).
- **Multilingual Voice Capture**: Speech recognition via Web Speech API in `en-IN`, `hi-IN`, and `te-IN` with silence auto-stop and manual keyboard fallback.
- **Rules-First NLU Engine**: `src/lib/nlu/rules.js` achieves **100.0% accuracy (60/60 sentences)** on `tests/fixtures/nlu-corpus.json` across English, Hindi, and Telugu, with rate-limited server-side Gemini 3.1 Flash-Lite fallback.
- **Confirmation & Undo Flow**: In-place review modal with single-generation UUID idempotency keys preventing duplicate entries on double-tap, disambiguation chips for product hints, inline editing, and single-click undo.
- **Regional Localization**: Full `en`, `hi`, and `te` translations (`public/i18n/*.json`), Noto Sans fonts, and text-to-speech feedback via `public/js/tts.js`.
- **Proactive Alerts & Inquiries**: Real-time low-stock banner and 14-day consumption reorder recommendations computed entirely from PostgreSQL ledger rows via `src/routes/queries.js`.

## Architecture

Client requests capture user voice or text input, obtain a Supabase JWT session, and communicate with Express 5 running on Vercel edge infrastructure. Business logic and ledger mutations are executed directly within PostgreSQL RPCs.

```
[Browser: HTML + Web Speech API + i18n]
                  │
                  ▼ (JWT via Authorization header)
[Express 5 on Vercel Serverless (bom1 - Mumbai)]
     │                                    │
     │ (RLS-Scoped DB Client)             │ (Server-side NLU fallback only)
     ▼                                    ▼
[Postgres RPCs: apply/undo movement]    [Gemini 3.1 Flash-Lite API]
     │
     ▼
[Supabase Managed PostgreSQL]
```

## Security

- **Row Level Security**: Enabled on `profiles`, `products`, `product_aliases`, `unit_conversions`, and `stock_movements`.
- **Least-Privilege Database Grants**: Authenticated users can only alter inventory through security-definer RPC functions; direct ledger modifications and negative balances are denied at the database engine level.
- **Token Verification**: Every Express route validates user identity using Supabase JWT claims (`getClaims`), creating an isolated RLS database client per request.
- **Secret Isolation**: `SUPABASE_SECRET_KEY` and `GEMINI_API_KEY` reside exclusively in server environment variables and are never bundled into client assets.
- **Privacy**: Gemini never receives customer names, phone numbers, or merchant identity.

## Zero-Cost Stack

- **Supabase Free Tier**: Free PostgreSQL and Auth kept active via an automated daily keep-alive cron job (`/api/cron/keepalive`).
- **Vercel Hobby**: Zero-cost hosting with Mumbai region (`bom1`) minimizing latency for Indian networks.
- **Gemini Free Quota**: Deterministic rules handle standard speech without cost, reserving Flash-Lite free tier with a 50 request/day cap for conversational edge cases.
- **Architecture Efficiency**: Avoided paid phone OTP by using email authentication, and avoided Render to eliminate cold-boot spin-downs.

## How to Verify

- `npm run verify` — Validates environment configuration, keys, and Gemini connectivity (**7/7 checks passed**).
- `npm run verify:backend -- <live-url>` — Tests multi-tenant isolation, RPC idempotency, concurrent transactions, and undo guards against production (**15/15 checks passed**).
- `npm test` — Executes full test suite verifying unit conversions, NLU rules corpus accuracy, and API endpoints (**59/59 tests passed**).

## Live Links

- Production URL: [LIVE_URL]
- Source Code Repository: [REPO_URL]
