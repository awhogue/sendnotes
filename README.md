# SendNotes

A Progressive Web App for collecting notes, links, and articles throughout the week, then generating a formatted email newsletter to copy into Gmail.

## Features

- **Quick capture**: Add URLs or notes from mobile or desktop
- **Share sheet integration**: Save links directly from other apps on mobile
- **Offline support**: Works without internet, syncs when back online
- **Newsletter generation**: Create formatted HTML ready to paste into Gmail
- **Weekly archive**: Archive sent items to start fresh each week

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS (PWA)
- **Database**: Supabase (Postgres) - client-side access
- **Hosting**: Netlify (static site)

## Setup Instructions

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. In the SQL Editor, run the following schema:

```sql
-- Drop existing table if re-running this setup
drop policy if exists "Owner only" on items;
drop policy if exists "Allow all operations" on items;
drop table if exists items;

-- Create the items table
create table items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  url text,
  title text,
  notes text,
  category text,
  status text default 'active',
  week_of date
);

-- Create indexes for common queries
create index items_status_idx on items(status);
create index items_week_idx on items(week_of);

-- Enable Row Level Security
alter table items enable row level security;

-- Create a policy that restricts access to the owner's email
create policy "Owner only" on items
  for all
  using (auth.jwt() ->> 'email' = 'ahogue@gmail.com')
  with check (auth.jwt() ->> 'email' = 'ahogue@gmail.com');
```

3. Go to **Settings → API** and copy your:
   - Project URL (e.g., `https://xxxxx.supabase.co`)
   - Anon/public key (the `anon` `public` key)

### 2. Configure the App

Edit `js/config.js` and add your Supabase credentials:

```javascript
const CONFIG = {
  SUPABASE_URL: 'https://your-project.supabase.co',
  SUPABASE_ANON_KEY: 'your-anon-key-here'
};
```

> **Note:** The anon key is safe to expose in frontend code. Security is enforced through Row Level Security (RLS) policies in Supabase.

### 3. Deploy to Netlify

1. Push your code to GitHub
2. Connect the repository to Netlify
3. Deploy - no build settings or environment variables needed!

### 4. Install as PWA

On mobile:
- **iOS**: Open in Safari → Share → Add to Home Screen
- **Android**: Open in Chrome → Menu → Add to Home Screen

On desktop:
- Chrome/Edge: Click the install icon in the address bar

## Local Development

You can simply open `index.html` in a browser, or use any static server:

```bash
# Using Python
python3 -m http.server 8000

# Using Node.js (npx)
npx serve .

# Using Netlify CLI
netlify dev
```

## Project Structure

```
/
├── index.html              # Main app shell
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
├── css/
│   └── style.css           # Styles
├── js/
│   ├── config.js           # Supabase configuration
│   ├── app.js              # Main app logic
│   ├── api.js              # Supabase client with offline queue
│   └── offline-store.js    # IndexedDB wrapper
├── icons/
│   ├── icon.svg            # Source icon
│   ├── icon-192.png        # PWA icon (192x192)
│   └── icon-512.png        # PWA icon (512x512)
├── netlify.toml            # Netlify configuration
└── package.json            # Package metadata
```

## Security Notes

This app uses Google SSO via Supabase Auth:

- Only the allowlisted email (ahogue@gmail.com) can access data
- The RLS policy checks the JWT email claim
- The anon key is safe to expose; security is enforced server-side

To change the allowed email, update the RLS policy in Supabase:

```sql
drop policy "Owner only" on items;
create policy "Owner only" on items
  for all
  using (auth.jwt() ->> 'email' = 'your-email@gmail.com')
  with check (auth.jwt() ->> 'email' = 'your-email@gmail.com');
```

## License

MIT
