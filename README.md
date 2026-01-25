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
- **Backend**: Netlify Functions (serverless)
- **Database**: Supabase (Postgres)
- **Hosting**: Netlify

## Setup Instructions

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. In the SQL Editor, run the following schema:

```sql
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

create index items_status_idx on items(status);
create index items_week_idx on items(week_of);
```

3. Go to Settings → API and copy your project URL and anon key

### 2. Configure Netlify

1. Connect your repository to Netlify
2. Go to Site settings → Environment variables
3. Add the following variables:
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_ANON_KEY`: Your Supabase anon key

### 3. Generate App Icons

Replace the placeholder icons with proper PNG files:

```bash
# Using ImageMagick (if installed)
convert icons/icon.svg -resize 192x192 icons/icon-192.png
convert icons/icon.svg -resize 512x512 icons/icon-512.png

# Or use an online tool like realfavicongenerator.net
```

### 4. Deploy

Push to your repository - Netlify will automatically deploy.

### 5. Install as PWA

On mobile:
- **iOS**: Open in Safari → Share → Add to Home Screen
- **Android**: Open in Chrome → Menu → Add to Home Screen

On desktop:
- Chrome/Edge: Click the install icon in the address bar

## Local Development

```bash
# Install dependencies
npm install

# Install Netlify CLI globally (if not already)
npm install -g netlify-cli

# Start local dev server
netlify dev
```

The app will be available at `http://localhost:8888`.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/items` | Get active items for current week |
| POST | `/api/items` | Create a new item |
| PUT | `/api/items/:id` | Update an item |
| DELETE | `/api/items/:id` | Soft-delete an item |
| POST | `/api/generate` | Generate newsletter HTML |
| POST | `/api/archive` | Archive all active items |

## Project Structure

```
/
├── index.html              # Main app shell
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
├── css/
│   └── style.css           # Styles
├── js/
│   ├── app.js              # Main app logic
│   ├── api.js              # API client with offline queue
│   └── offline-store.js    # IndexedDB wrapper
├── netlify/
│   └── functions/
│       ├── items.js        # Items CRUD
│       ├── generate.js     # Newsletter generation
│       └── archive.js      # Archive items
├── icons/
│   ├── icon.svg            # Source icon
│   ├── icon-192.png        # PWA icon (192x192)
│   └── icon-512.png        # PWA icon (512x512)
├── netlify.toml            # Netlify configuration
└── package.json            # Dependencies
```

## License

MIT
