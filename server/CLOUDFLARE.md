# Free Cloudflare hosting

The connected service uses Cloudflare Workers Free and a persistent D1 database. It is separate from the team's static Worker until the full flow is verified. No Railway account, payment card, paid Workers plan, R2 bucket or GoDaddy domain is required. Free quotas can stop requests; free availability is not unlimited or guaranteed forever. Keep Gemini on its existing free-tier project without enabling billing.

## Prepared code

- Local app: npm.cmd --prefix server start (unchanged localhost:3001 workflow).
- Hosted app: server/worker/index.js; D1 schema: server/worker/schema.sql.
- Deployment config: wrangler.connected.jsonc (Worker name physipeak).
- Before publishing replace its all-zero database_id with the actual formnote-journal D1 ID in the same Cloudflare account.
- Frontend + API + fixed cached voices are served from one HTTPS origin.
- Auth0 access tokens are checked for RS256 signature, issuer, API audience, expiry and subject. A request cannot choose another account's scope.
- No access tokens, API key, local database or user notes are bundled into frontend assets. Photos and documents still stay in the browser.
- Hosted fictional-development endpoints are intentionally disabled. The normal journal and consent-based AI tools work with actual non-clinical demo session input.
- Cloudflare daily AI caps: 10 generation attempts per signed-in account, 50 total. Reservations, cached results and generation locks persist in D1. Provider failures count toward the cap. These caps do not enable billing.

## Account setup, in order

1. Cloudflare owner invites the developer using account Members permissions sufficient for Workers and D1. Stay on Workers Free.
2. Create D1 database formnote-journal. Copy its Database ID into wrangler.connected.jsonc. The ID is not a secret.
3. Auth0 owner: Applications > APIs > Create API. Name Physipeak API; Identifier https://physipeak-api; signing algorithm RS256. Under Application Access, authorize User-Delegated Access for the existing website SPA (client ID kgZffBxFat1RgVYqMWY6Rgww7OiShO61); creating an API alone does not authorize that application. Do not use the SPA client ID as the API identifier. No client secret goes into frontend configuration.
4. Log the CLI into the SAME Cloudflare account with ./server/node_modules/.bin/wrangler.cmd login. If several accounts are listed, configure account_id explicitly using the account that owns the database. No secret token needs to be pasted into chat.
5. Build and create tables (schema uses CREATE IF NOT EXISTS, never drops records):

~~~powershell
npm.cmd --prefix server ci
node scripts/build.mjs
./server/node_modules/.bin/wrangler.cmd d1 execute formnote-journal --config wrangler.connected.jsonc --remote --file server/worker/schema.sql
~~~

6. Set the private Gemini key using the CLI's interactive secret prompt; paste only into that prompt:

~~~powershell
./server/node_modules/.bin/wrangler.cmd secret put GEMINI_API_KEY --config wrangler.connected.jsonc
~~~

GEMINI_MODEL is public configuration; use the existing working model, not a guessed model. The key must remain on the free-tier project. Do not commit .env or .dev.vars. Cached speech playback makes no runtime TTS call.

7. Publish after reviewing the prepared changes:

~~~powershell
node scripts/build.mjs
./server/node_modules/.bin/wrangler.cmd deploy --config wrangler.connected.jsonc
~~~

8. Copy the HTTPS workers.dev origin printed by deployment. Auth0 owner adds that exact origin to the SPA's Allowed Callback URLs, Allowed Logout URLs and Allowed Web Origins, in addition to existing origins. Keep Google/database connections enabled. Sign out/in again to obtain an access token for the new API audience.
9. Check /health; it should show hosting cloudflare-d1 and aiConfigured true. Complete sign-in, a manual session, a camera session, check-in, optional explanation, sharing preview/consent and Gemini report. Test another account cannot see those records. Reload and verify the saved report remains. Physical camera performance must be checked on the intended device.

## GitHub and future releases

Commit/push the hosting branch and review its PR. The current existing deploy-cloudflare.yml still owns only the original static Worker. It does NOT deploy physipeak. To update the connected service, use the explicit connected-config deploy command above. This keeps teammate UI deployments from replacing the connected API accidentally. After validation, choose which URL/domain is the official demo and configure a separate reviewed deployment workflow.

For a later custom domain, configure it on the connected Worker, then add that exact HTTPS origin to Auth0. A new browser origin has different localStorage/IndexedDB: old browser-only photos/documents and unsynced sessions do not automatically move. D1 records remain accessible to the same signed-in user. There is no automatic import of your laptop's private SQLite database.

## Verification

~~~powershell
npm.cmd --prefix server test
node --test tests/*.test.mjs pushup.test.mjs
node scripts/build.mjs
./server/node_modules/.bin/wrangler.cmd deploy --config wrangler.connected.jsonc --dry-run
~~~

Worker tests exercise Cloudflare's actual local D1 engine with locally signed test JWTs. They do not use a real account, live Gemini or a hosted database. Browser sign-in and public deployment still require the owner's account setup.

## Ownership handoff

The current deployment is https://physipeak.smganeev.workers.dev in the teammate-owned account. Before removing the developer membership, export the D1 database, redeploy the code into the developer-owned account, import and verify the data, set private Worker secrets there, and update Auth0 origins. Once the replacement works, ask the teammate to remove the membership and revoke the old CLI authorization. No transfer or access removal has been performed yet.
