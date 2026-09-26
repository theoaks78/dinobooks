# DinoBooks — the website

The DinoBooks library on the web, in two halves:

- **The showcase** (`index.html`, `timeline.html`): anyone with the link can browse.
  It only reads, through the publishable key, and never changes anything.
- **The app** (`app/`): the real DinoBooks app, compiled for a browser. Anyone can
  open it, but it stops at the sign-in screen. Signed in, it does everything the
  phone app does except what needs a camera (scanning barcodes, photographing
  covers, reading a back cover). On a PC you type the ISBN and choose a cover file.

Live at `https://theoaks78.github.io/dinobooks/`. The **✎ Sign in to edit** button
on both showcase pages opens the app.

## Showcase pages

- **Library**: every book, with search (title, author, series, genre,
  character/franchise, ISBN), shelf tabs, a Read tab, **Group by** (Title / Author /
  Shelf / Audience / Audience + Shelf, the app's groupings, with timber shelf
  headers that collapse) and **Series together** (series bands, in series-number
  order). The **Genre** menu filters to one genre and shows what it means in this
  library. The grouping and series choice are remembered in that browser.
- **Book detail**: the cover on its engraved shelf (audience + shelf), READ banner
  and rating, format, publisher and date, pages, character/franchise, ISBN with the
  isbnsearch link, signed, genres, description, contents and reading history.
  **Tap a genre** to see its definition and a link to every book carrying it.
- **Reading Timeline**: newest first, by year. As in the app, **the cover opens
  the book and the card opens that book's reading history**, and the title there
  opens the book. Stats: books read, reads logged, **past year** (a rolling twelve
  months, like the app) and average rating.

Not shown on the public pages, on purpose: loans (`book_movements` has no anon
policy), Up Next, notes and location. Signed in, the app shows all of them.

The site has **no build step and no server code**. The showcase fetches live from
the Supabase REST API on every load, so data changes need no update at all.

## Files

| File | Purpose |
|---|---|
| `index.html` | Library page |
| `timeline.html` | Reading Timeline page |
| `styles.css` | Shared theme (paper, spruce, honey, timber) |
| `shared.js` | Data fetching, covers, shelves, genres, the book and history pop-ups |
| `config.js` | Supabase URL + publishable key |
| `assets/logo.png`, `assets/favicon.png` | The dinosaur |
| `app/` | The web build of the app. **Generated. Never edit by hand.** |

## Updating the showcase

Edit a file in the GitHub web UI (pencil icon) or upload a replacement. The site
republishes within a minute or two.

## Updating the app (`app/` folder)

The app folder is produced from the Flutter project, not written by hand:

1. In `F:\FlutterApps\dinobooks`, run `.\build-web.ps1`. It analyzes, runs
   `flutter build web --base-href /dinobooks/app/`, empties
   `F:\Dino Books\dinobooks-site\app` and copies the new build in.
2. On github.com, open the `dinobooks` repository → **Add file → Upload files** →
   drag in the **`app` folder** (the folder itself, so the paths stay `app/...`).
   Commit.
3. Open `https://theoaks78.github.io/dinobooks/app/`. The first load after an
   update may need **Ctrl+F5**.

Rebuild it whenever you build an APK, so the browser and the phones run the same
code. The base path matters: a build without `--base-href /dinobooks/app/` loads a
blank page on GitHub Pages.

## Security notes

- The key in `config.js` is a *publishable* key. It is designed to be public and only
  grants what Row Level Security allows: **read-only** access to the catalogue
  tables for anyone not signed in.
- **Signed in means full access.** Every table has an `auth full access` policy for
  the `authenticated` role, and that is what lets the app (phone or web) edit. So
  **new sign-ups must stay switched off** in Supabase (Authentication → Sign In /
  Providers → *Allow new users to sign up*: off). If sign-ups were on, anyone could
  create an account with the public key and edit or delete the library. This was
  already true for the phone app; the web app just makes the sign-in page easier
  to find. Accounts are added by hand in the dashboard (Authentication → Users →
  Add user).
- `app_settings` (the Google Books key) has no anon policy, so the showcase can't
  read it. The web app reads it only once signed in, like the phone app.
- The Anthropic key never leaves Supabase's Edge Function secrets. Genre and Up Next
  suggestions work from the web app because the functions answer browsers (CORS)
  and check the signed-in user's token.
- To take the showcase private again, delete the "anon read" policies in Supabase.
  The app keeps working for signed-in users either way.
