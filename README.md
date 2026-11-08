# Formnote

Formnote is a camera-assisted movement practice journal prototype for HackCamp. It tracks movement estimates, supports guided range calibration, records pain and confidence check-ins, and prepares a patient-reviewed visit note.

## Repository

- `frontend/` — static browser app. Camera processing runs in the browser; session history, calibration, plan, photos, and scanned papers are stored locally per signed-in Auth0 user.
- `server/` — separate synthetic-session report service. It is not connected to the frontend and must not receive real patient records in this prototype.
- `shared/`, `tracking/`, `design/` — project contracts and planning notes.

## Run the frontend locally

From the repository root, run:

```powershell
py -m http.server 4173 --directory frontend
```

Open <http://localhost:4173>. Camera access requires localhost or HTTPS.

## Auth0

Create an Auth0 **Single Page Application**. Add these origins to **Allowed Callback URLs**, **Allowed Logout URLs**, and **Allowed Web Origins**:

- `http://localhost:4173`
- `https://steep-bush-dac6.smganeev.workers.dev`

For local manual runs, put the Auth0 tenant domain (without `https://`) and Client ID in `frontend/auth0-config.js`. They are public SPA settings. Never put a Client Secret in browser code or this repository.

The app keeps camera images and health notes on this browser. Auth0 login does not sync data to another device or a physiotherapist. Camera angles are estimates and are not a diagnosis or treatment recommendation.

## Deploy to the existing Cloudflare Worker

`wrangler.jsonc` publishes `frontend/` to the existing Worker `steep-bush-dac6`. The GitHub Actions workflow deploys on changes to `main` and can also be started manually. It skips deployment with a notice until the Auth0 variables and Cloudflare secrets below have been added.

In **GitHub → Settings → Secrets and variables → Actions**, add:

**Variables**

- `AUTH0_DOMAIN` — Auth0 tenant domain, without `https://`
- `AUTH0_CLIENT_ID` — SPA Client ID

**Secrets**

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` — a Cloudflare API token with Workers deployment permissions, scoped to this account

The workflow writes the public Auth0 values into a generated `frontend/auth0-config.js` for that deployment, then runs Wrangler. The Cloudflare token stays in GitHub Secrets and is never written to the repository.

## Prototype limits

Photos and diagnosis documents stay in browser storage. Reports are generated locally and require patient review before sharing. The separate server currently accepts synthetic data only; it is not protected by Auth0 or integrated with the frontend.
