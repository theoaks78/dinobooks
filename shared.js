/* ============================================================
   DinoBooks — shared helpers (live data, covers, shelves, modal)
   Read-only: the site only ever reads through the publishable key.
   Editing happens in the app, which for a PC lives at app/.
   ============================================================ */

const spineColors = ['#0c905b','#b8236f','#226ae1','#0ca4c4','#f88134','#d8ab16'];
const hash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* The app's audience order (Junior → General). Anything else sorts last. */
const AUDIENCES = ['Junior', 'Young Adult', 'Adult', 'General'];

/* Small wrappers so a browser that refuses storage (private window, blocked
   site data) simply forgets preferences instead of breaking the page. */
const prefs = {
  get(k, fallback) { try { const v = localStorage.getItem('dino.' + k); return v === null ? fallback : v; } catch (_) { return fallback; } },
  set(k, v) { try { localStorage.setItem('dino.' + k, v); } catch (_) { /* not remembered, that's all */ } }
};

/* ---------- live data ---------- */
async function rest(path) {
  const res = await fetch(`${DINO.SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: DINO.API_KEY, Authorization: `Bearer ${DINO.API_KEY}` }
  });
  if (!res.ok) throw new Error(`Database said no (${res.status})`);
  return res.json();
}

/* PostgREST returns an embedded resource as an object rather than an array
   when the foreign key is unique. The app learnt this the hard way
   (embeddedRows); the same guard here means neither shape breaks the site. */
const rows = v => Array.isArray(v) ? v : (v ? [v] : []);

async function fetchLibrary() {
  const select = [
    "id,book_uuid,title,pages,format,isbn,description,audience,language,signed,publisher,date_published,is_anthology,cover_url",
    "book_authors(position,authors(family_name,given_names))",
    "book_series(series_number,series(name))",
    "book_shelves(shelves(name))",
    "book_genres(genres(tag,type,definition))",
    "book_characters(characters(name))",
    "reading_sessions(id,read_start,read_end,rating,review_notes,created_at)",
    "anthology_titles(position,title,author:authors(family_name,given_names))"
  ].join(",");
  // PostgREST caps one response at 1000 rows, so page until a short page.
  const out = [];
  for (let from = 0; ; from += 1000) {
    const page = await rest(`books?select=${encodeURIComponent(select)}&order=title.asc&limit=1000&offset=${from}`);
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out.map(normalizeBook);
}

function authorName(a) {
  if (!a) return "";
  return [a.given_names, a.family_name].filter(Boolean).join(" ");
}
function authorSortName(a) {
  if (!a) return "";
  return [a.family_name, a.given_names].filter(Boolean).join(" ");
}

function normalizeBook(r) {
  const authorRows = rows(r.book_authors).slice()
    .sort((x, y) => (x.position || 0) - (y.position || 0))
    .map(x => x.authors).filter(Boolean);
  const authors = authorRows.map(authorName).filter(Boolean);
  const seriesEntries = rows(r.book_series).map(x => ({
    name: x.series ? x.series.name : "", number: x.series_number
  })).filter(x => x.name);
  const shelves = rows(r.book_shelves).map(x => x.shelves ? x.shelves.name : "").filter(Boolean);
  const genres = rows(r.book_genres).map(x => x.genres).filter(g => g && g.tag)
    .map(g => ({ tag: g.tag, type: g.type, definition: g.definition || "" }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
  const characters = rows(r.book_characters).map(x => x.characters ? x.characters.name : "")
    .filter(Boolean).sort((a, b) => a.localeCompare(b));
  // Newest first: read_end, falling back to read_start, then when it was logged.
  const sessions = rows(r.reading_sessions).slice().sort((a, b) =>
    (b.read_end || b.read_start || b.created_at || "").localeCompare(a.read_end || a.read_start || a.created_at || ""));
  const rated = sessions.filter(s => s.rating != null);
  const anth = rows(r.anthology_titles).slice()
    .sort((x, y) => (x.position || 0) - (y.position || 0))
    .map(x => ({ position: x.position, title: x.title, author: authorName(x.author) }));
  const audience = r.audience || "";
  const shelf = shelves[0] || "";
  return {
    id: r.id,
    bookUuid: r.book_uuid ? r.book_uuid.replace(/-/g, '') : null,
    title: r.title || "Untitled",
    authors,
    authorLine: authors.join(", "),
    authorSort: (authorRows[0] ? authorSortName(authorRows[0]) : "").toLowerCase(),
    series: seriesEntries,
    seriesLine: seriesEntries.map(s => s.number ? `${s.name} (${s.number})` : s.name).join(", "),
    shelves,
    shelf,
    audience,
    // "ADULT GENERAL FICTION" on the app's timber shelf: audience then shelf.
    shelfLine: [audience, shelf].filter(Boolean).join(" "),
    genres,
    characters,
    pages: r.pages,
    format: r.format,
    publisher: r.publisher,
    published: r.date_published,
    language: r.language,
    signed: !!r.signed,
    isbn: r.isbn,
    isbnSearch: r.isbn ? 'https://isbnsearch.org/isbn/' + encodeURIComponent(r.isbn) : null,
    description: r.description,
    isAnthology: r.is_anthology,
    anth,
    cover: r.cover_url || null,
    sessions,
    isRead: sessions.length > 0,
    rating: rated.length ? rated[0].rating : null
  };
}

/* ---------- descriptions ----------
   Descriptions carry a little HTML from the publishers (b, i, p, br, strong,
   em, the odd link). Only that much is let through; every other tag is
   dropped and every attribute removed, so a stray tag in a blurb can never
   do more than make a word bold. */
function safeDescription(html) {
  const allowed = new Set(['B', 'I', 'EM', 'STRONG', 'P', 'BR', 'UL', 'OL', 'LI']);
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html || '');
  const walk = node => {
    [...node.childNodes].forEach(child => {
      if (child.nodeType === 1) {
        walk(child);
        if (allowed.has(child.tagName)) {
          [...child.attributes].forEach(a => child.removeAttribute(a.name));
        } else {
          child.replaceWith(...child.childNodes);   // keep the words, lose the tag
        }
      } else if (child.nodeType !== 3) {
        child.remove();                             // comments and the like
      }
    });
  };
  walk(tpl.content);
  return tpl.innerHTML;
}

/* ---------- covers ----------
   The app stamps ?v=<timestamp> on cover_url whenever a cover is replaced,
   so a new cover is a new URL and the browser's cache can be trusted. The
   old last_update stamp is gone: that column never changes after insert. */
function coverHTML(b, opts = {}) {
  let inner;
  if (b.cover) {
    inner = `<img loading="lazy" src="${esc(b.cover)}" alt="Cover of ${esc(b.title)}">`;
  } else {
    const col = spineColors[hash(b.title) % spineColors.length];
    inner = `<div class="noCover" style="background:linear-gradient(150deg,${col},${col}cc)">${esc(b.title)}</div>`;
  }
  const tick = (!opts.big && b.isRead) ? '<div class="readtick">READ ✓</div>' : '';
  return `<div class="cover">${inner}<div class="edge"></div>${tick}</div>`;
}

/* The app's WoodShelf: a timber plank with the label cut into it. */
function woodShelfHTML(label, extra = '') {
  return `<div class="woodshelf"><div class="plank"><span class="engraved">${esc(label)}</span>${extra}</div><div class="plank-edge"></div></div>`;
}

/* ---------- series numbers ----------
   series_number is text, so a plain sort puts 11 before 2. Compare as
   numbers when both parse; books with no number go to the end. */
function seriesNumberCompare(a, b) {
  const x = (a == null || a === '') ? null : parseFloat(a);
  const y = (b == null || b === '') ? null : parseFloat(b);
  const nx = x != null && !isNaN(x), ny = y != null && !isNaN(y);
  if (nx && ny) return x - y;
  if (nx) return -1;
  if (ny) return 1;
  if (!a) return b ? 1 : 0;
  if (!b) return -1;
  return String(a).localeCompare(String(b));
}

/* ---------- dates & stars ---------- */
function fmtDate(d) {
  if (!d) return null;
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function sessionWhen(s) {
  const a = fmtDate(s.read_start), b = fmtDate(s.read_end);
  if (a && b) return a === b ? b : `${a} → ${b}`;
  if (b) return `finished ${b}`;
  if (a) return `started ${a}`;
  return "date lost to time";
}
function starsHTML(r) {
  if (r == null) return "";
  const n = Number(r);
  let out = "";
  for (let i = 1; i <= 5; i++) out += i <= n ? "★" : (i - 0.5 === n ? "⯨" : "☆");
  return `<span class="stars" title="${n} / 5" aria-label="${n} out of 5">${out}</span>`;
}

/* ---------- genres ----------
   Tapping a genre shows what it means in THIS library (the same definitions
   the app and its genre suggestions use). On the Library page the note also
   offers to show every book carrying it. */
function genrePillsHTML(b) {
  if (!b.genres.length) return '';
  return `<div class="genres">
    <div class="pills">${b.genres.map((g, i) =>
      `<button type="button" class="pill genrepill" data-g="${i}" title="${esc(g.definition)}" aria-expanded="false">${esc(g.tag)}</button>`).join('')}
    </div>
    <div class="gdef" hidden></div>
  </div>`;
}
function wireGenrePills(root, b) {
  const box = root.querySelector('.genres');
  if (!box) return;
  const note = box.querySelector('.gdef');
  box.querySelectorAll('.genrepill').forEach(btn => btn.addEventListener('click', () => {
    const g = b.genres[Number(btn.dataset.g)];
    const wasOpen = btn.classList.contains('on');
    box.querySelectorAll('.genrepill').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-expanded', 'false'); });
    if (wasOpen) { note.hidden = true; return; }
    btn.classList.add('on'); btn.setAttribute('aria-expanded', 'true');
    const browse = typeof window.filterByGenre === 'function'
      ? `<button type="button" class="linkish" data-browse>Show every ${esc(g.tag)} book →</button>`
      : `<a class="linkish" href="index.html#genre=${encodeURIComponent(g.tag)}">Show every ${esc(g.tag)} book →</a>`;
    note.innerHTML = `<b>${esc(g.tag)}</b> <span class="gtype">${esc(g.type || '')}</span><br>${esc(g.definition) || '<i>No definition yet.</i>'}<br>${browse}`;
    note.hidden = false;
    const go = note.querySelector('[data-browse]');
    if (go) go.addEventListener('click', () => { closeModal(); window.filterByGenre(g.tag); });
  }));
}

/* ---------- modal: the book ---------- */
function readingHistoryHTML(b, highlightId) {
  if (!b.sessions.length) return "";
  const items = b.sessions.map(s => `
    <li class="${s.id === highlightId ? 'this-read' : ''}">
      <span class="when">${esc(sessionWhen(s))}</span>
      ${starsHTML(s.rating)}
      ${s.review_notes ? `<div class="revnotes">${esc(s.review_notes)}</div>` : ""}
    </li>`).join("");
  return `<div class="history"><h4>Reading history</h4><ul>${items}</ul></div>`;
}

function factRow(label, valueHTML) {
  return valueHTML ? `<div class="fact"><b>${label}</b><span>${valueHTML}</span></div>` : '';
}

function openModal(b) {
  const body = document.getElementById('modalBody');
  const published = [b.publisher, b.published].filter(Boolean).map(esc).join('<br>');
  body.innerHTML = `
    <div class="modal-cover">
      ${coverHTML(b, { big: true })}
      ${b.shelfLine ? woodShelfHTML(b.shelfLine) : ''}
    </div>
    <div class="modal-info">
      ${b.isRead ? `<div class="readbanner">READ ✓ ${b.rating != null ? starsHTML(b.rating) : ''}</div>` : ''}
      <h2 id="modalTitle">${esc(b.title)}</h2>
      <div class="by">by ${esc(b.authorLine) || "Unknown"}</div>
      ${b.seriesLine ? `<div class="serline">${esc(b.seriesLine)}</div>` : ''}
      <div class="facts">
        ${factRow('Format', esc(b.format))}
        ${factRow('Published', published)}
        ${factRow('Pages', b.pages ? esc(b.pages) : '')}
        ${factRow('Character/Franchise', b.characters.map(esc).join('<br>'))}
        ${factRow('ISBN', b.isbn ? `${esc(b.isbn)} <a href="${esc(b.isbnSearch)}" target="_blank" rel="noopener">Search cover</a>` : '')}
        ${factRow('Language', b.language && b.language !== 'English' ? esc(b.language) : '')}
        ${factRow('Signed', b.signed ? 'Yes ✍' : '')}
      </div>
      ${genrePillsHTML(b)}
      ${b.description ? `<div class="desc">${safeDescription(b.description)}</div>` : ''}
      ${b.anth.length ? `<div class="anth"><h4>Contents</h4><ol>${
        b.anth.map(t => `<li><b>${esc(t.title)}</b>${t.author ? ` — ${esc(t.author)}` : ""}</li>`).join("")
      }</ol></div>` : ''}
      ${readingHistoryHTML(b)}
      <div class="bookid">Book ${esc(b.id)} · ${esc(b.bookUuid)}</div>
    </div>`;
  body.className = 'modal-body';
  wireGenrePills(body, b);
  showOverlay();
}

/* ---------- modal: one book's reading history ----------
   The app's Timeline: the cover is the book, the card is this read. So the
   card opens the reading history, and the title there opens the book. */
function openHistory(b, sessionId) {
  const body = document.getElementById('modalBody');
  body.innerHTML = `
    <div class="hist-head">
      <div class="hist-cover">${coverHTML(b, { big: true })}</div>
      <div>
        <button type="button" class="titlelink" id="modalTitle">${esc(b.title)}</button>
        <div class="by">${esc(b.authorLine)}</div>
        ${b.seriesLine ? `<div class="serline">${esc(b.seriesLine)}</div>` : ''}
      </div>
    </div>
    ${readingHistoryHTML(b, sessionId)}`;
  body.className = 'modal-body single';
  body.querySelector('.titlelink').addEventListener('click', () => openModal(b));
  showOverlay();
}

let lastFocus = null;
function showOverlay() {
  const overlay = document.getElementById('overlay');
  if (!overlay.classList.contains('open')) lastFocus = document.activeElement;
  overlay.classList.add('open');
  overlay.querySelector('.modal').scrollTop = 0;
  document.body.classList.add('noscroll');
  document.getElementById('close').focus();
}
function closeModal() {
  const overlay = document.getElementById('overlay');
  overlay.classList.remove('open');
  document.body.classList.remove('noscroll');
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
function wireModal() {
  const overlay = document.getElementById('overlay');
  document.getElementById('close').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal(); });
}

/* Cards are buttons: click, Enter or Space. */
function activate(el, fn) {
  el.addEventListener('click', fn);
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); } });
}

/* ---------- loading / error ---------- */
function showLoading(el) {
  el.innerHTML = `<div class="loading"><img src="assets/logo.png" alt="" class="bounce"><p>The helpful dino is fetching your books…</p></div>`;
}
function showError(el, err, retry) {
  el.innerHTML = `<div class="loaderr"><p><b>Couldn't load the library.</b></p>
  <p>Check this device is online, then try again.</p>
  <p><button type="button" class="btn" id="retry">Try again</button></p>
  <details><summary>Details</summary><code>${esc(err && err.message || err)}</code></details></div>`;
  const b = el.querySelector('#retry');
  if (b && retry) b.addEventListener('click', retry);
}
