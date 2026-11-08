# Formnote

Formnote is a camera-assisted movement practice journal prototype for HackCamp. It tracks movement estimates, supports guided range calibration, records pain and confidence check-ins, and prepares a patient-reviewed visit note.

## Repository

- `index.html`, `app.js`, `auth0-config.js`, `_headers` — static browser app at the repository root, alongside the rest of the project. Camera processing runs in the browser; session history, calibration, plan, photos, and scanned papers are stored locally per signed-in Auth0 user.
- `dist/` — generated deployment bundle, excluded from Git. The workflow creates it from the root app files before deploying.
- `server/` — integrated local Express/SQLite backend. Actual non-clinical demo statistics can be shared with Gemini only after reviewing the payload and explicitly consenting. See [the connected-page guide](server/CARE-PAGES.md).
- `shared/`, `tracking/`, `design/` — project contracts and planning notes.

## Run the frontend locally

From the repository root, run:

```powershell
npm.cmd --prefix server ci
npm.cmd --prefix server start
```

Open <http://localhost:3001>. Use Node.js 24 or newer. Keep existing server/.env private; see server/.env.example for model configuration. Local notes work without an API key. Camera access requires localhost or HTTPS.

## Air pointer and swipe scrolling

In Practice, open **Camera & body side → Enable air pointer**. Face the camera at your normal exercise distance with both shoulders and one hand visible. Aim at four dots, holding still after each move, then follow the open-palm swipe-up and swipe-down lessons. The preview shows the tracked fingertip. Failed positions offer a full restart instead of repeating a fifth dot.

Point with your index finger to move the cursor. It latches onto a control through small shakes; move clearly outside the control to release it. Regular controls activate after 650 ms of tracked hold time (Start 800 ms, Capture photo 700 ms, Finish/destructive actions 1100 ms). Brief tracking hiccups pause the timer; a lost hand cannot finish a click. Relax the finger before clicking again.

For continuous scrolling, open your palm and hold it briefly at a comfortable neutral position. Raise it to scroll up or lower it to scroll down; farther from neutral scrolls faster. Keep the hand there to travel the whole page. Make a fist to stop immediately and reset neutral. Returning to neutral also stops; missing tracking, pointing, losing focus, and changing sections stop scrolling. Press Escape to disable the pointer. The camera stays on across sections while the pointer is enabled; use Turn camera off in Practice when finished.

The tracker crops around distant wrists, maps the fingertip relative to the shoulders, filters tracking spikes, and renders the cursor between camera observations. Both shoulders and recognizable fingers must remain visible; distance compensation cannot recover detail the camera cannot resolve. Image crops use MediaPipe's [image detection API](https://developers.google.com/edge/api/mediapipe/js/tasks-vision.handlandmarker). Pointer calibration version 2 replaces the earlier pointer setup without clearing session history or photos.

Pointer regression checks run with `node --test tests/air-pointer.test.mjs`. The optional `node tests/pointer-browser-smoke.mjs` check requires Node 20+, Playwright, an installed Chromium browser, and a freshly built `dist/` from `node scripts/build.mjs`. It serves a local synthetic identity and video, tests calibration and scrolling, and never accesses a webcam. A real camera check at the intended distance and lighting is still needed.

## Sign-in (Auth0)

Formnote's sign-in screen offers **Continue with Google**, **Sign in with email** (email and password) and **Create an account**. Auth0 manages credentials. Missing configuration keeps the app gated with an actionable error. See [authentication and deployment setup](AUTH-DEPLOYMENT.md) for verified settings, owner steps and test limitations.

### 1. Create the Auth0 application

1. Create a free tenant at <https://auth0.com>.
2. **Applications → Applications → Create Application**, choose **Single Page Application**, name it Formnote.
3. Open its **Settings** tab and add these origins to **Allowed Callback URLs**, **Allowed Logout URLs** and **Allowed Web Origins**, then save:
   - `http://localhost:3001` (integrated app and backend)
   - `http://localhost:4173` (static-only preview)
   - `https://steep-bush-dac6.smganeev.workers.dev`
4. Copy the **Domain** (no `https://`) and **Client ID**. Both are public. Never put the Client Secret in this repository.

### 2. Turn on email and password

**Authentication → Database → Username-Password-Authentication → Applications** tab: switch on Formnote. Auth0 emails new email-and-password users a verification link, and the app reminds them to verify. Auth0's built-in email sender is for testing only, so set a real provider under **Branding → Email Provider** before sharing the site widely.

### 3. Turn on Google

**Authentication → Social → Google**, then open the **Applications** tab and switch on Formnote.

- **Quick test:** a new tenant already has Google on with Auth0's shared development keys. It works right away, but the Google consent screen shows Auth0's name.
- **Your own Google app:** in Google Cloud Console (APIs & Services → Credentials) use an OAuth client of type *Web application* and add `https://YOUR_AUTH0_DOMAIN/login/callback` under **Authorized redirect URIs**. Paste its Client ID and Client Secret into Auth0's Google connection. The secret lives only in Auth0. If the consent screen is in *Testing* mode, only listed test users can sign in until you publish it.

### 4. Give the app the Auth0 values

- **Deployed site:** in **GitHub → Settings → Secrets and variables → Actions → Variables**, set `AUTH0_DOMAIN` and `AUTH0_CLIENT_ID`, then run **Actions → Deploy Formnote to Cloudflare → Run workflow**.
- **Local run:** put the same two values in `auth0-config.js` (do not commit them if you prefer to keep them out of history; they are public settings either way).

### What the sign-in does

- Signed-out visitors see only the sign-in screen. Signed-in people get their own journal: sessions, calibration, plan and photos are stored in this browser under their account and are not shared between accounts on the same device.
- People stay signed in after a refresh and come back to the section they were on.
- If Auth0 sends back a problem (cancelled, unverified email, blocked), the screen says so and lets them try again.
- Login does not sync data to another device or to a physiotherapist. Camera angles are estimates and not a diagnosis or treatment recommendation.

## Deploy to the existing Cloudflare Worker

`wrangler.jsonc` publishes the generated `dist/` bundle to the existing Worker `steep-bush-dac6`. The GitHub Actions workflow deploys on changes to the root app files in `main` and can also be started manually. Missing Cloudflare secrets fail the deployment. Auth0 configuration is validated before publishing. See [the deployment checklist](AUTH-DEPLOYMENT.md).

In **GitHub → Settings → Secrets and variables → Actions**, add:

**Variables**

- `AUTH0_DOMAIN` — Auth0 tenant domain, without `https://`
- `AUTH0_CLIENT_ID` — SPA Client ID

**Secrets**

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` — a Cloudflare API token with Workers deployment permissions, scoped to this account

The workflow generates public Auth0 configuration in `dist/`, includes transitive frontend modules, runs Wrangler, then verifies the live commit and asset hashes. The Cloudflare token stays in GitHub Secrets and is never written to the repository.

## Prototype limits

Photos and diagnosis documents stay in browser storage. Reports are generated locally and require patient review before sharing. The original fictional-demo endpoints remain synthetic-only. Separate consent-based endpoints support actual camera/manual measurements for the non-clinical hackathon demo. Browser profile scopes are not backend authentication; public or clinical deployment requires additional work.
