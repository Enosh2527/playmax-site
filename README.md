# Playmax — React (Vite + Tailwind)

A single-page site for Playmax DJ services.

## Run locally

```bash
npm install
npm run dev
```

Then open the URL printed by Vite (usually http://localhost:5173).

### Required environment variables

The repo ships with ready-to-use Supabase credentials so you can explore immediately. If you want to point the app at your own project, create a `.env.local` file in the project root before starting the dev server:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_KEY=your-public-anon-key
# Optional legacy name also supported:
# VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

See [Supabase storage setup](#supabase-storage-setup-free-tier) for table definitions and a full walkthrough.

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

## Supabase storage setup (free tier)

VaultHub now uses [Supabase](https://supabase.com) as its zero-cost cloud vault. Every prompt, link, and script upload is written to your project's Postgres database through the REST API. To get started:

1. Create a Supabase project (the free tier includes 500 MB of database storage which is plenty for prompt text and small script bundles).
2. In the Supabase dashboard, create the vault tables using the SQL editor:

   ```sql
   create table if not exists public.allowed_emails (
     email text primary key,
     role text default 'member',
     created_at timestamptz default now()
   );

   insert into public.allowed_emails (email, role)
   values
     ('admin@vaulthub.dev', 'admin'),
     ('rajhanoch24@gmail.com', 'admin')
   on conflict (email) do update set role = excluded.role;

   create table if not exists public.prompts (
     id uuid primary key,
     name text not null,
     description text,
     notes text,
     uploader text,
     uploader_email text,
     created_at timestamptz default now(),
     reference_name text,
     reference_mime text,
     reference_size bigint,
     reference_content text
   );

   create table if not exists public.links (
     id uuid primary key,
     name text not null,
     url text not null,
     notes text,
     uploader text,
     uploader_email text,
     created_at timestamptz default now(),
     reference_name text,
     reference_mime text,
     reference_size bigint,
     reference_content text
   );

   create table if not exists public.scripts (
     id uuid primary key,
     type text not null,
     name text not null,
     original_name text,
     notes text,
     uploader text,
     uploader_email text,
     created_at timestamptz default now(),
     parent_id uuid,
     file_mime text,
     file_size bigint,
     file_content text,
     reference_name text,
     reference_mime text,
     reference_size bigint,
     reference_content text
   );
   ```

   The app stores script files and folders in this table. Files are base64 encoded (along with optional reference attachments) and remain lightweight enough for Supabase's free limits. The `reference_*` columns let you attach screenshots, docs, or other helpers to any prompt, link, or script entry. The `allowed_emails` table keeps your access list in sync across devices so anyone you approve from the Admin Control Room can register and start uploading straight away.
3. Open **Project Settings → API** and copy the **Project URL** and **anon public key**.
4. Create a `.env.local` file with those values so the front-end can talk to your project. You can paste the API URL, the dashboard URL, or just the project ref — the app normalises each format automatically:

   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_KEY=your-public-anon-key
   # Optional legacy name also supported:
   # VITE_SUPABASE_ANON_KEY=your-public-anon-key
   ```

5. Restart the dev server. The dashboard will show a “Connected to Supabase” badge once the credentials are valid. Bulk downloads, context menus, and folder uploads all operate directly against your Supabase tables.

### Supabase policies

If Supabase responds with a `row-level security policy` error while you seed admins, upload files, or approve new email addresses, the project still has Row Level Security enabled on one of the vault tables. Clear the block by running the SQL below in the Supabase dashboard (SQL Editor ▶️ **New query**):

```sql
alter table public.allowed_emails disable row level security;
alter table public.prompts disable row level security;
alter table public.links disable row level security;
alter table public.scripts disable row level security;

create policy "allow anon access" on public.allowed_emails
  for all to anon using (true) with check (true);
create policy "allow anon access" on public.prompts
  for all to anon using (true) with check (true);
create policy "allow anon access" on public.links
  for all to anon using (true) with check (true);
create policy "allow anon access" on public.scripts
  for all to anon using (true) with check (true);
```

Disabling RLS (or adding the permissive policies above) is enough for closed internal vaults that rely on the anon key bundled with this project. If you later migrate to Supabase Auth you can replace the permissive policies with rules that reference `auth.uid()` or `auth.email()`.

The default Playmax build points at the shared project `cauostpphtbzfyejffhk` using the anon key
`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhdW9zdHBwaHRiemZ5ZWpmZmhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5NjAyMjQsImV4cCI6MjA3NTUzNjIyNH0.JTucDx5zwBf2tk8LndLumLXInKc5BFDhvjxO9fZd7kI`, so you can run the app without creating your own Supabase account if you just want to test uploads and downloads.

Because the anon key is public, every request stays client-side and there is no additional server to maintain. Restrict insert/update/delete access with Supabase Row Level Security if you intend to expose the vault broadly.

## Ready-to-use verification build

If you want to test the production bundle (the same one you would deploy), build and run the preview server locally. This serves the optimized assets and is the best way to validate upload, download, and admin flows end to end.

```bash
npm install
npm run build
npm run preview
```

Visit the printed URL (default `http://localhost:4173`) to exercise the full experience against your Supabase project using the bundled credentials.

## Build

```bash
npm run build
npm run preview
```
