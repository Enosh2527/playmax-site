# Playmax — React (Vite + Tailwind)

A single-page site for Playmax DJ services.

## Run locally

```bash
npm install
npm run dev
```

Then open the URL printed by Vite (usually http://localhost:5173).

## Default access

Two administrator accounts are seeded so you can explore the workspace immediately:

| Name | Email | Password |
| --- | --- | --- |
| Vault Admin | `admin@vaulthub.dev` | `admin123` |
| Raj Hanoch | `rajhanoch24@gmail.com` | `raj_admin123` |

Use one of these credentials on the login screen. Administrators can approve additional email addresses from the Admin Control Room once signed in.

## Draft preview mode

Launch the interface with a persistent "Draft preview" banner by using Vite's `draft` mode. This is handy when you want to
circulate an internal build before publishing.

```bash
npm install
npm run draft
```

The app will be available on http://localhost:5173 with the draft ribbon displayed across the top of the dashboard.

## Google Drive storage setup

VaultHub persists prompts, scripts, and links to a dedicated folder in your Google Drive. The ready-to-use build already embeds production credentials so you can connect immediately:

```
VITE_GOOGLE_CLIENT_ID=952287910237-kqtdm3ls26n054t3eoelmi901filbmj0.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=AIzaSyALZ-76IMlrMHlRv0oNurLBfmM_mK_R9Ac
```

If you'd like to supply your own keys instead, follow these steps before running the project locally:

1. Visit the [Google Cloud Console](https://console.cloud.google.com/) and create a project (or reuse an existing one).
2. Enable the **Google Drive API** for that project.
3. Create OAuth 2.0 credentials of type **Web application** with the following settings:
   - Add each environment (for example `http://localhost:5173`, `http://localhost:4173`, your production hostname, and any deploy preview URLs) to **Authorized JavaScript origins**.
   - Leave the redirect URI list empty—VaultHub uses the token-based flow and does not require redirects.
   Copy the generated **Client ID**.
4. Create an API key for the same project (or reuse an existing key) and restrict it to the Google Drive API if desired.
5. Create a `.env.local` file in the project root with your credentials:

   ```bash
   VITE_GOOGLE_CLIENT_ID=your-oauth-client-id.apps.googleusercontent.com
   VITE_GOOGLE_API_KEY=your-google-api-key
   ```

6. Restart the dev server (`npm run dev`). Once you log in to the dashboard, click **Connect Google Drive** to authorize the app. A folder named **VaultHub Workspace** will be created automatically with Prompts, Scripts, and Links subfolders for storing your uploads.

## Browser vault storage (zero-cost alternative)

If you're running into repeated Drive authorization errors or simply want a private workspace, switch the **Workspace vault** toggle to **Browser vault**. This mode keeps every prompt, script, and link inside the current browser via `localStorage`, so no Google Cloud setup is required.

- The browser vault is enabled by default for new visitors. Use the toggle in the dashboard header to hop back to Google Drive whenever you're ready to sync across accounts.
- Data never leaves the device. Each browser profile gets its own vault; clear it by opening the developer console and running `localStorage.removeItem('vaulthub-local-workspace-v1')`.
- Bulk downloads, folder uploads, context actions, and previews behave identically to Drive mode—the app compresses the locally stored bytes into ZIP files on demand when you download.

### Fixing the `redirect_uri_mismatch` error

If Google blocks the popup with a `redirect_uri_mismatch` message, it means the current site URL hasn't been registered on the OAuth client. Grab the exact origin from your browser's address bar (for example `https://652c1a57ab3a12345--playmax.netlify.app`) and add it to the **Authorized JavaScript origins** list for the Drive OAuth credentials. Save the change, wait a few seconds for it to propagate, then try connecting again.

### Troubleshooting Google Drive connection failures

When Drive rejects a request, the dashboard now keeps the exact error text Google returned and surfaces it directly below the **Workspace vault** header. You'll also see the raw `reason`, `status`, and `code` fields so support can pinpoint the fix quickly. A few common resolutions:

- **`insufficientPermissions` / `PERMISSION_DENIED`** – enable the Google Drive API for your OAuth project and list the signing-in account as a test user on the consent screen.
- **`accessNotConfigured` or messages about the API not being used before** – enable the Drive API in Google Cloud console and retry after a short delay.
- **`invalid_grant`** – the Drive token has expired or was revoked. Click **Connect Google Drive** again or revoke the existing grant from [Google Account permissions](https://myaccount.google.com/permissions) before reconnecting.
- **`invalid` / `Invalid Value`** – VaultHub detected a stale Drive folder reference. Press **Refresh Drive** so the app can recreate its `VaultHub Workspace` structure automatically. If the error persists, delete the `VaultHub Workspace` folder from Drive and reconnect.
- **Rate limit errors** – wait a minute before syncing again; Google's throttling should clear automatically.

Share the error card details if you ask for help—they match exactly what Google sent back.

### Why the preview can feel slow the first time

VaultHub now loads Google's authentication libraries lazily, only after you sign in and land on the dashboard. A status banner explains whether the app is "Loading Google authentication libraries…" or "Syncing your Google Drive workspace…" so you know the UI is waiting on Google. The very first load can still take 5–10 seconds while those scripts initialise, but subsequent visits reuse the cached libraries and feel immediate.

## Ready-to-use verification build

If you want to test the production bundle (the same one you would deploy), build and run the preview server locally. This serves the optimized assets and is the best way to validate upload, download, and admin flows end to end.

```bash
npm install
npm run build
npm run preview
```

Visit the printed URL (default `http://localhost:4173`) to exercise the full experience against Google Drive using the bundled credentials.

## Build

```bash
npm run build
npm run preview
```
