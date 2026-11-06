# Public Actions Explorer — synthetic browser E2E contract

**Development test plan only; not an authenticated E2E or production release gate.**

The public, read-only `/developer-tools/github-actions` page fetches
`/api/public-actions` from the application's server. Browser tests in
[`tests/e2e/public-actions.spec.ts`](../tests/e2e/public-actions.spec.ts)
route ONLY this same-origin API request to **fixed synthetic fixtures**.
They do not query GitHub, read tokens, authenticate users, trigger Actions,
change a GitHub repository, or rely on real workflow history.

The tests cover:

- A two-run sample, total-vs-inspected count labels, percentage visualization
  and exact trusted GitHub run URLs
- Rejected repository syntax (HTTP 400), without stale result cards
- Rate-limit/unavailable result (HTTP 503), without invented success counts
- Empty successful workflow history and its non-billing disclaimer
- Alternative repository input and narrow/mobile viewport

## Run manually on isolated localhost

After installing locked dependencies, using only placeholder public Firebase
configuration and NO real API key:

```bash
npx playwright install chromium
npx playwright test tests/e2e/public-actions.spec.ts --project=chromium
```

Playwright's existing `webServer` starts `npm run dev` on localhost:9002;
it is not a production deployment. The test itself does not start Firebase
emulators, sign in, create users, mutate Firestore, run GitHub workflows or call
external GitHub APIs. The app shell may request normal static assets.

**Evidence limits:** this is a simulated *browser-to-app response* flow.
It does not establish that GitHub's real upstream REST response, server
validator, rate limits, CDN, authentication or production deployment behaves
as expected. A separately authorized live verification must retain exact
revision, environment, timestamps, data samples, screenshots, failures and
reviewer evidence. A successful synthetic run is not billed-minutes evidence.

## Existing authenticated-chat E2E is still blocked

The existing [`tests/e2e/chat.spec.ts`](../tests/e2e/chat.spec.ts) assumes the
chat interface is available at `/` without establishing a server Firebase
session. But [`src/app/page.tsx`](../src/app/page.tsx) redirects anonymous
visitors to `/login`. That old suite MUST NOT be claimed as a passing
authenticated browser regression gate based on public-route tests. Do not
add a test-only auth bypass or claim a green full E2E suite until a true
localhost Auth/Firestore emulator identity and server-cookie fixture is
implemented and independently reviewed.

The manual `.github/workflows/e2e-tests.yml` remains unchanged; do not mark
it required or silently suppress failed/skipped authenticated coverage.
Track remaining auth E2E and production checks under
[readiness #109](https://github.com/senanurcetin/Ops-Copilot/issues/109)
and [NEXUS release #48](https://github.com/senanurcetin/Ops-Copilot/issues/48).
