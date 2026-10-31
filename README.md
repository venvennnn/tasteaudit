# TasteAudit

TasteAudit checks whether a simulated assistant recommends books or places that fit a customer’s explicit interests and constraints. Qloo supplies cross-domain taste evidence. Gemini writes the original answer, an optional self-refinement, and a grounded revision. Judges can run the guided demo or configure a company scenario. Visitors can download the current result.

This repository is one Next.js application. There is no login, database, or background worker.

## What this session remembers

The run lives in React state in the open tab. Refreshing or closing the tab clears it. The app does not use `localStorage`, `sessionStorage`, or IndexedDB. Download JSON or CSV if you want a copy on your device. Importing that file restores it in memory and labels every score as imported evidence. Imported numbers are not treated as a new provider verification.

Sending a request to Qloo or Gemini is separate from that browser memory. TasteAudit does not promise that those providers, the host, or network infrastructure retain nothing. Server logs record a failure code, stage, and request id. They do not record customer prompts or raw provider payloads.

## Local setup

Use Node.js 22.

```bash
npm ci
cp .env.example .env.local
```

Fill the server variables in `.env.local`. None of them use a `NEXT_PUBLIC_` prefix.

| Variable | Purpose |
| --- | --- |
| `QLOO_API_KEY` | Sent only as the `X-Api-Key` header |
| `QLOO_BASE_URL` | Optional. Unset uses `https://hackathon.api.qloo.com`. Any other host is rejected. The hackathon key does not work on `https://api.qloo.com`. |
| `GEMINI_API_KEY` | Google Gemini API key. This is separate from the Qloo hackathon email. |
| `GEMINI_MODEL` | Optional. Unset uses `gemini-3.8-flash`. The server uses one model for every arm. Gemini 3.8 does not accept temperature or top-p, so those parameters are not sent. |
| `EVIDENCE_SIGNING_SECRET` | Optional. At least 16 characters. Scoring then returns a short-lived HMAC envelope, and the revision includes numeric affinity only when that envelope verifies. |
| `TASTEAUDIT_MAX_CITIES` | Optional cap, at most 4 |
| `TASTEAUDIT_INSTANCE_RPM` | Optional per-isolate request cap. This resets with the process and is not a durable global rate limit. |
| `QLOO_TIMEOUT_MS` | Upstream Qloo budget, default 12000, kept below the route limit |
| `GEMINI_TIMEOUT_MS` | Upstream Gemini budget, default 25000 |

```bash
npm run dev
```

Open `http://localhost:3000`. The place demo compares four cities with `filter.location.query`. The book demo compares four readers with different explicit interests and does not send a city to Qloo. The demo presets are inputs, not completed audits. “Simulated concierge” and “Simulated bookseller” are unaffiliated with Marriott and Barnes & Noble.

```bash
npm run smoke
```

Smoke calls `GET /search` and one tiny Gemini structured response when the variables above are present. It prints status and model name, not secrets. Without keys it skips and exits 0. Set `SMOKE_REQUIRED=1` to fail that skip.

```bash
npm run lint
npm run typecheck
npm test
npm run test:browser
```

`npm run test:browser` installs nothing by itself. Install the Playwright browser once with `npx playwright install chromium`.

## Deploy on Vercel Pro

1. Push this repository to GitHub.
2. In Vercel, import the repository, choose Next.js, and use this directory as the project root.
3. In the Vercel project, open Settings, then Environment Variables. Add the same names for Production and Preview. Do not mark them as exposed to the browser, and do not prefix them with `NEXT_PUBLIC_`. Then redeploy so the new values are picked up.
   - `QLOO_API_KEY`: the key from the Qloo hackathon email
   - `QLOO_BASE_URL`: `https://hackathon.api.qloo.com`
   - `GEMINI_API_KEY`: a Google AI Studio key
   - `GEMINI_MODEL`: `gemini-3.8-flash`
4. Each provider route sets `maxDuration = 60` and `runtime = "nodejs"`. Confirm the project’s plan allows that duration. Qloo calls time out after `QLOO_TIMEOUT_MS` and Gemini calls after `GEMINI_TIMEOUT_MS`, with at most two attempts, so a route returns inside the platform limit. Vercel Pro does not include Qloo or Gemini charges.
5. Deploy a preview, click through the demo and the company flow, then promote that commit.
6. Add a custom domain if you want one, and confirm HTTPS.
7. Check Deployment Protection. Judges need the public pages without a Vercel account. Use the platform firewall or WAF for abuse control. The in-app counter is per isolate only.
8. No database migration or worker deploy is required.

Personalized API responses send `Cache-Control: no-store`.

## How a run moves

The browser calls short stateless routes, in this order: resolve favorite names, write the original answer, optionally self-refine, extract names with exact quotations, resolve those names, discover candidates, score one shared pool, rerank the original names locally, write a grounded revision, then compute coverage. Discovery can proceed beside the writing branch. Closing the tab stops the run. There is no durable resume. Retry repeats a failed stage and keeps completed stage data.

Qloo calls from the server:

- `GET /search` with `query`, `types`, `page`, `take`, and `sort_by=match`
- `GET /v2/insights` with `filter.type`, `signal.interests.entities`, `feature.explainability=true`, and `take`
- Places may add `filter.location.query`, documented for Place as a locality candidate filter. Books do not. `signal.location` and `signal.location.query` appear in the parameter dictionary for both types and are absent from the book and place entity-type tables, so they are not sent. Affinity stays interest-based.
- Scoring adds `filter.results.entities` for the shared pool and reads `query.affinity`. It does not copy the discovery list in place of a missing score.
- An explicit age is mapped only onto a documented band (`24_and_younger`, `25_to_29`, `30_to_34`, `35_to_44`, `45_to_54`, `55_and_older`) and the mapping is shown. Gender and audience ids are not sent.
- `GET /entities` is available for metadata. Metadata does not prove hours, stock, price, or accessibility.

Affinity is not preference accuracy or a purchase probability. Missing affinity is not zero. Reranking does not change the mean of the same complete set. A shorter list is disclosed. A failed hard constraint is not overruled by a high affinity. Hours, price, edition, stock, and accessibility stay Unknown without independent evidence.

Regional Audit sends `filter.type=urn:tag` with `signal.location.query` for taste analysis, then passes only tags whose types include the target entity URN through `signal.interests.tags`. Book and place entity scoring does not send `signal.location` or `signal.location.query`. If that derived evidence is missing, the comparison is not relabelled as global. Personalized runs can request `feature.explainability=true` and, on demand, rescore a fixed candidate pool with one interest removed.

## Checks recorded for this build

Software tests were run in this workspace on 30 October 2026 (Asia/Calcutta evening, machine clock UTC):

- `npx next lint` reported no warnings or errors.
- `npx tsc --noEmit` passed.
- `npx next build` passed on Next.js 15.5.28.
- `npx vitest run` passed 23 tests: null tags, missing explainability, invalid repair ids, type mismatch, provisional matches, duplicate pool entries, missing scores kept out of the mean, quote checks, configuration invalidation, coverage denominators, rerank behavior, age bands, CSV escaping, route timeout, 429 and 5xx retry, authentication without retry, malformed JSON, cross-origin rejection, evidence signature rejection, secret redaction, `no-store`, no browser-storage APIs, score retry without repeating the original answer, and cancelled runs.
- `npx playwright test` passed 6 tests: the demo flow, partial score failure and retry, compare-all baselines, navigation that keeps the persona, refresh that clears it, interest edits that invalidate results, reset during a company run, JSON import labeled as imported evidence, CSV/JSON download, reduced motion, keyboard focus, and 390px width without horizontal page overflow. The suite ran at 1280×800 and 390×844.
- `npm run smoke` skipped live Qloo and Gemini calls because this environment has no provider keys. It printed: `Live provider checks skipped: QLOO_API_KEY, QLOO_BASE_URL, GEMINI_API_KEY, or GEMINI_MODEL is not set.` Run `npm run smoke` after filling `.env.local` and keep the status lines. Do not paste secrets into the log.

Fixtures under `tests/` are software test data. They are not measured TasteAudit results. The product preview on the homepage is a layout sketch and does not show a score.

## License

MIT. See `LICENSE`.
