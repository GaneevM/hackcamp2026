# Formnote frontend

Static browser application. It uses no front-end build step. Run from the repository root:

```powershell
py -m http.server 4173 --directory frontend
```

Open http://localhost:4173. Camera access works on localhost or HTTPS.

## Auth0

Create a **Single Page Application** in Auth0. Add both origins below to **Allowed Callback URLs**, **Allowed Logout URLs**, and **Allowed Web Origins**:

- `http://localhost:4173`
- `https://steep-bush-dac6.smganeev.workers.dev`

For a local run, fill `auth0-config.js` with the tenant domain (no `https://`) and SPA Client ID. Do not add a Client Secret. For GitHub deployments, set `AUTH0_DOMAIN` and `AUTH0_CLIENT_ID` as Actions variables at the repository level; the workflow generates the config at deploy time.

Auth0 only signs the user into this browser prototype. Session data, photos, and scanned papers remain on the device and are not synced with a physiotherapist.
