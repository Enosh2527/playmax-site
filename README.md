# Playmax — React (Vite + Tailwind)

A single-page site for Playmax DJ services.

## Run locally

```bash
npm install
npm run dev
```

Then open the URL printed by Vite (usually http://localhost:5173).

## Draft preview mode

Launch the interface with a persistent "Draft preview" banner by using Vite's `draft` mode. This is handy when you want to
circulate an internal build before publishing.

```bash
npm install
npm run draft
```

The app will be available on http://localhost:5173 with the draft ribbon displayed across the top of the dashboard.

## Google Drive storage setup

VaultHub persists prompts, scripts, and links to a dedicated folder in your Google Drive. Provide API credentials before you run the project locally:

1. Visit the [Google Cloud Console](https://console.cloud.google.com/) and create a project (or reuse an existing one).
2. Enable the **Google Drive API** for that project.
3. Create OAuth 2.0 credentials of type **Web application** with the following settings:
   - Authorized JavaScript origin: `http://localhost:5173`
   - Authorized redirect URI: `http://localhost:5173`
   Copy the generated **Client ID**.
4. Create an API key for the same project (or reuse an existing key) and restrict it to the Google Drive API if desired.
5. Create a `.env.local` file in the project root with the credentials:

   ```bash
   VITE_GOOGLE_CLIENT_ID=your-oauth-client-id.apps.googleusercontent.com
   VITE_GOOGLE_API_KEY=your-google-api-key
   ```

6. Restart the dev server (`npm run dev`). Once you log in to the dashboard, click **Connect Google Drive** to authorize the app. A folder named **VaultHub Workspace** will be created automatically with Prompts, Scripts, and Links subfolders for storing your uploads.

## Build

```bash
npm run build
npm run preview
```
