# DinoBooks — the website

A small, read-only website for the DinoBooks library. Two pages:

- **index.html** — the Library: every book on its shelf, with search, shelf tabs, and a detail view
- **timeline.html** — the Reading Timeline: dated reads on a trail through time, plus the "already read" shelf

The site has **no build step and no server code**. Both pages fetch live data from the
Supabase REST API when they load, so any book added to the database appears on the
website the next time the page is refreshed — no redeploy needed.

## Files

| File | Purpose |
|---|---|
| `index.html` | Library page |
| `timeline.html` | Reading Timeline page |
| `styles.css` | Shared theme (paper, spruce, honey, timber) |
| `shared.js` | Data fetching, covers, modal, helpers |
| `config.js` | Supabase URL + publishable key |
| `assets/logo.png`, `assets/favicon.png` | The dinosaur |

## Hosting on GitHub Pages (one-time setup, ~5 minutes)

1. Sign in at **github.com**.
2. Click the **+** (top-right) → **New repository**.
   - Name: `dinobooks` (or anything you like)
   - Visibility: **Public** (required for free GitHub Pages)
   - Leave everything else unticked → **Create repository**.
3. On the new repo page, click the link **"uploading an existing file"**
   (or `Add file → Upload files`).
4. Drag in ALL the site files **including the `assets` folder** — the easiest way is to
   drag the *contents* of this zip (not the zip itself) into the upload box.
   Then click **Commit changes**.
5. Go to the repo's **Settings → Pages** (left sidebar).
   - Under *Build and deployment*: Source = **Deploy from a branch**
   - Branch = **main**, Folder = **/ (root)** → **Save**.
6. Wait a minute or two, then refresh Settings → Pages. Your site is live at:

   `https://<your-username>.github.io/dinobooks/`

Send that link to Libby. Bookmark it on her phone's home screen and it behaves
almost like an app.

## Updating the site later

Edit a file in the GitHub web UI (pencil icon) or upload a replacement file —
the site republishes automatically within a minute or two.
Data changes (new books, reading sessions) need **no** update at all.

## Security notes

- The key in `config.js` is a *publishable* key — it is designed to be public and
  only grants what the database's Row Level Security allows. For this project
  that is **read-only** access to the catalogue tables.
- Writes (adding/editing books, sessions, loans) still require a logged-in user —
  the website cannot modify anything.
- The `book_movements` table (who borrowed what) is **not** readable by the
  website at all.
- Anyone who has the website link can browse the catalogue and review notes.
  To take the site private again, delete the "anon read" policies in Supabase.
