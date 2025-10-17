# Playmax — React (Vite + Tailwind)

A single-page vault for prompts, scripts, and links with GitHub-inspired styling.

## Run locally

```bash
npm install
npm run dev
```

Then open the URL printed by Vite (usually http://localhost:5173).

### Required environment variables

All uploads, metadata, and allowlist entries are stored in Cloudflare R2. The Netlify
functions will fall back to the shared Playmax credentials below, but you can override
them with your own secrets by defining the same keys in your hosting provider or in a
local `netlify/.env` file.

```
R2_ACCESS_KEY_ID=33f46d555ee615172b0ce1cb58017638
R2_SECRET_ACCESS_KEY=d36aa75d050d65f8dce2affa9ba51bd5d3437a623a95792ddc97b5455bcabd6f
R2_ACCOUNT_ID=cdb6fe7f2b93a9c99d0966ae16f28826
R2_BUCKET=vault-files
R2_REGION=auto
```

`netlify/functions/presign-upload.js` mints presigned PUT/GET URLs so the browser can
upload directly to R2, and `netlify/functions/vault-store.js` manages the vault metadata
(`vault/metadata.json`) inside the same bucket.

### Cloudflare R2 setup

1. Create a bucket called **`vault-files`** (or provide your own name and update
   `R2_BUCKET`).
2. Enable CORS for your site origins with the methods `PUT, GET, HEAD` and the header
   `Content-Type`.
3. Generate an API token with **Edit** permissions for the bucket and paste the access
   key, secret key, and account ID into the environment variables listed above.

The app will bootstrap its metadata file automatically the first time you add a prompt,
script, link, or allowlist entry.

## Default access

Two administrator accounts are seeded so you can explore the workspace immediately:

| Name        | Email                   | Password        |
| ----------- | ----------------------- | --------------- |
| Vault Admin | `admin@vaulthub.dev`    | `admin123`      |
| Raj Hanoch  | `rajhanoch24@gmail.com` | `raj_admin123` |

Use one of these credentials on the login screen. Administrators can approve additional
email addresses from the Admin Control Room once signed in.

## Draft preview mode

Launch the interface with a persistent "Draft preview" banner by using Vite's `draft`
mode when you want to circulate an internal build before publishing.

```bash
npm install
npm run draft
```

The app will be available on http://localhost:5173 with the draft ribbon displayed
across the top of the dashboard.

## Ready-to-use verification build

If you want to test the production bundle (the same one you would deploy), build and run
the preview server locally. This serves the optimized assets and is the best way to
validate upload, download, and admin flows end to end.

```bash
npm install
npm run build
npm run preview
```

Visit the printed URL (default `http://localhost:4173`) to exercise the full experience
against the bundled Cloudflare R2 credentials.

## Build

```bash
npm run build
npm run preview
```
