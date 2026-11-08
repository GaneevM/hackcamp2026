# Authentication and deployment

## Observed failure

Run [#17](https://github.com/GaneevM/hackcamp2026/actions/runs/42463874602), job 128678812236, logged `Deployment skipped` and exited 0 when credentials were absent. Its publish step was skipped. The repository secret API returned `total_count: 0` on November 8, 2026. Both public Auth0 repository variables exist. Current main and the manually uploaded live UI had diverged; this branch preserves the live design/push-up additions and current main's companion, journal and backend integration.

The new main-branch deployment fails on missing secrets, builds with validated nonempty Auth0 settings, publishes the existing Worker, then compares live assets against a commit manifest. PRs run validation without production secrets or publishing.

## Repository owner: Cloudflare secrets

In [repository Actions secrets](https://github.com/GaneevM/hackcamp2026/settings/secrets/actions), use **New repository secret** for both names:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | `c7381e03d94d43a54e2ee57899416e4a` (public account ID confirmed in the existing Worker dashboard URL) |
| `CLOUDFLARE_API_TOKEN` | A Cloudflare API token, created by the account owner, scoped to that account with Account → Workers Scripts → Edit and Account → Account Settings → Read. No zone/DNS or user-management access is needed for this existing workers.dev static Worker. |

Create the token in Cloudflare **My Profile → API Tokens → Create Token → Custom token**. Do not use a Global API key or an Auth0 secret. Enter the token directly into GitHub; never into source, chat, workflow YAML or logs. Alternatively `gh secret set CLOUDFLARE_API_TOKEN --repo GaneevM/hackcamp2026` prompts securely. GitHub never permits retrieving the saved value.

After merging the PR, open **Actions → Deploy Formnote to Cloudflare → Run workflow → main**. The push to main also triggers it. Confirm that **Require deployment credentials**, **Deploy static frontend**, and **Verify live assets and authentication configuration** all succeed. A previous green run or a manual dashboard upload is not proof of this pipeline working.

## Auth0 application settings

Application: client ID `kgZffBxFat1RgVYqMWY6Rgww7OiShO61`, domain `dev-nq4wzkj35d08hmds.us.auth0.com`. Both are public identifiers. Configure application type **Single Page Application** and token endpoint authentication **None**. Do not add a Client Secret to this browser application.

Use the exact production value `https://physipeak.smganeev.workers.dev` in **Allowed Callback URLs**, **Allowed Logout URLs**, and **Allowed Web Origins**. Add the same origin under **Allowed Origins (CORS)** if shown. The SDK explicitly uses this origin for both redirect and logout; route and exercise query parameters travel in SDK appState. For local work, separately allow `http://127.0.0.1:4182` and `http://localhost:4182` if needed, without `/dist` or route fragments.

Under **Connections**, enable Google (`google-oauth2`) and the database connection `Username-Password-Authentication` for this application. Allow signups on the database connection and use Auth0 Universal Login. The public client metadata currently advertises both connections and `showSignup: true`, and advertises the production callback above. Full allowlists and Google provider credentials still need checking in the dashboard; public metadata cannot prove those complete settings. Use your own Google OAuth credentials for production, with Auth0's documented Google callback URL. If you see a consent/connection error, inspect Auth0 Monitoring logs with the owner.

GitHub variables `AUTH0_DOMAIN` and `AUTH0_CLIENT_ID` override the committed public configuration when nonblank. Blank variables preserve the committed defaults. Invalid or empty final configuration fails the build. Runtime configuration errors keep the app gated and offer retry.

## SDK, persistence and data

The pinned Auth0 SPA SDK 2.4.1 browser bundle is served locally from `vendor/auth0-spa-js-2.4.1.min.js`, with its license. npm package integrity: `sha512-GE1XPLEgEUeqYBw5VcA52+3ubJDh4VKZFqdu0mr6h7anu+rFZb389cDbfpW145I23T1knZB/jvQtuRrkcLuT+Q==`; browser bundle SHA-256: `f9d838d542605372ac9ffc47c5c5bfc9b9445b8eceb14cc1e4dfe77a88118b45`. Failed loads can be retried. No blocking third-party SDK script is required.

The SDK uses its localStorage cache (as main already did) to retain valid authentication after refresh. Expired sessions may require signing in again when browser privacy settings prevent silent renewal. This patch does not introduce a custom password handler or store passwords. It does not request refresh tokens or depend on changing tenant refresh-token grants.

User history remains scoped by the Auth0 subject. Guest data, other profiles, calibration, goals, documents and photos are not deleted or automatically copied into a signed-in account. Auth0 logout clears its own authentication cache, not Formnote's records. Static HTML/config/modules revalidate; versioned SDK is immutable; CSS has a short cache lifetime. Entry URLs have generated content hashes. No service worker is installed by this project.

## Verification

Run `node --test tests/*.test.mjs pushup.test.mjs` in a shell that expands globs (or list the filenames on Windows), then `node scripts/build.mjs`. The auth tests use a fake SDK; they exercise routing, callback cleanup, retry, login options and persistence configuration, but do not prove real credentials work. `node scripts/smoke.mjs` checks the fixed production origin against `dist/release.json` after deployment; it deliberately fails against an older manual release.

`node tests/serve-auth-fixture.mjs` serves the built UI on 127.0.0.1:4183 with a synthetic SDK. `/?fixture=signedin&movement=pushup#move` checks app startup, exercise controls and scoped data without a real account. This fixture is never copied into dist.

Manual acceptance after a successful CI deployment: fresh/private visitor sees the gate; Google completes; database email sign-in completes; create an account in Universal Login (including any email verification); refresh retains a valid session; cancel/back/retry works; sign out returns to the gate; sign back into the same subject and confirm existing history; grant camera permission and test a movement. Account creation/password entry requires the user. Camera/pose accuracy and a real login/token exchange cannot be certified by the mock tests or asset smoke test.
