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
   - Add each environment (for example `http://localhost:5173`, `http://localhost:4173`, and your deployed hostname) to **Authorized JavaScript origins**.
   - Leave the redirect URI list empty—VaultHub uses the token-based flow and does not require redirects. If Google shows a `redirect_uri_mismatch` dialog, double-check that the origin you're testing from is listed in the OAuth client configuration.
   Copy the generated **Client ID**.
4. Create an API key for the same project (or reuse an existing key) and restrict it to the Google Drive API if desired.
5. Create a `.env.local` file in the project root with your credentials:

   ```bash
   VITE_GOOGLE_CLIENT_ID=your-oauth-client-id.apps.googleusercontent.com
   VITE_GOOGLE_API_KEY=your-google-api-key
   ```

6. Restart the dev server (`npm run dev`). Once you log in to the dashboard, click **Connect Google Drive** to authorize the app. A folder named **VaultHub Workspace** will be created automatically with Prompts, Scripts, and Links subfolders for storing your uploads.

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
