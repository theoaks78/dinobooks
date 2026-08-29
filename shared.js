/* ============================================================
   DinoBooks — shared helpers (live data, covers, modal)
   ============================================================ */

const FMT = { BOOK: "Paperback", "Hard Cover": "Hardcover" };
const spineColors = ['#0c905b','#b8236f','#226ae1','#0ca4c4','#f88134','#d8ab16'];
const hash = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* ---------- live data ---------- */
async function fetchLibrary() {
  const select = [
    "id,book_uuid,title,genre,pages,format,isbn,description,is_anthology,cover_url,last_update",
    "book_authors(position,authors(family_name,given_names))",
    "book_series(series_number,series(name))",
    "book_shelves(shelves(name))",
    "reading_sessions(id,read_start,read_end,rating,review_notes,created_at)",
    "anthology_titles(position,title,author:authors(family_name,given_names))"
  ].join(",");
  const url = `${DINO.SUPABASE_URL}/rest/v1/books?select=${encodeURIComponent(select)}&order=title.asc&limit=1000`;
  const res = await fetch(url, { headers: { apikey: DINO.API_KEY, Authorization: `Bearer ${DINO.API_KEY}` } });
  if (!res.ok) throw new Error(`Database said no (${res.status})`);
  const rows = await res.json();
  return rows.map(normalizeBook);
}

function authorName(a) {
  if (!a) return "";
  return [a.given_names, a.family_name].filter(Boolean).join(" ");
}

function normalizeBook(r) {
  const authors = (r.book_authors || [])
    .slice().sort((x, y) => (x.position || 0) - (y.position || 0))
    .map(x => authorName(x.authors)).filter(Boolean);
  const seriesEntries = (r.book_series || []).map(x => ({
    name: x.series ? x.series.name : "", number: x.series_number
  })).filter(x => x.name);
  const shelves = (r.book_shelves || []).map(x => x.shelves ? x.shelves.name : "").filter(Boolean);
  const sessions = (r.reading_sessions || []).slice().sort((a, b) =>
    (b.read_end || b.read_start || b.created_at || "").localeCompare(a.read_end || a.read_start || a.created_at || ""));
  const rated = sessions.filter(s => s.rating != null);
  const anth = (r.anthology_titles || [])
    .slice().sort((x, y) => (x.position || 0) - (y.position || 0))
    .map(x => ({ title: x.title, author: authorName(x.author) }));
  return {
    id: r.id,
    bookUuid: r.book_uuid ? r.book_uuid.replace(/-/g, '') : null,
    title: r.title,
    authors,
    authorLine: authors.join(", "),
    series: seriesEntries,
    seriesLine: seriesEntries.map(s => s.number ? `${s.name} (${s.number})` : s.name).join(", "),
    shelves,
    genre: r.genre,
    pages: r.pages,
    format: FMT[r.format] || r.format,
    isbn: r.isbn,
    description: r.description,
    isAnthology: r.is_anthology,
    anth,
    cover: coverUrl(r.cover_url, r.last_update),
    sessions,
    isRead: sessions.length > 0,
    rating: rated.length ? rated[0].rating : null
  };
}

/* ---------- covers ---------- */
// Append a cache-buster derived from the book's last_update so that a replaced
// cover (same filename) refreshes as soon as the row's last_update changes,
// while unchanged covers still cache normally. Bump last_update in the DB when
// you swap a cover:  update books set last_update = now() where id = <id>;
function coverUrl(url, lastUpdate) {
  if (!url) return null;
  const stamp = lastUpdate ? Date.parse(lastUpdate) : "";   // ms since epoch, or "" if absent
  if (!stamp) return url;
  return url + (url.includes("?") ? "&" : "?") + "v=" + stamp;
}

function coverHTML(b, big) {
  let inner;
  if (b.cover) {
    inner = `<img loading="lazy" src="${esc(b.cover)}" alt="Cover of ${esc(b.title)}">`;
  } else {
    const col = spineColors[hash(b.title) % spineColors.length];
    inner = `<div class="noCover" style="background:linear-gradient(150deg,${col},${col}cc)">${esc(b.title)}</div>`;
  }
  return `<div class="cover">${inner}<div class="edge"></div>${(!big && b.isRead) ? '<div class="readtick">READ ✓</div>' : ''}</div>`;
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
  let out = "";
  for (let i = 1; i <= 5; i++) {
    out += i <= r ? "★" : (i - 0.5 === Number(r) ? "⯨" : "☆");
  }
  return `<span class="stars" title="${r} / 5">${out}</span>`;
}

/* ---------- modal (shared) ---------- */
function readingHistoryHTML(b) {
  if (!b.sessions.length) return "";
  const rows = b.sessions.map(s => `
    <li>
      <span class="when">${esc(sessionWhen(s))}</span>
      ${starsHTML(s.rating)}
      ${s.review_notes ? `<div class="revnotes">${esc(s.review_notes)}</div>` : ""}
    </li>`).join("");
  return `<div class="history"><h4>Reading history</h4><ul>${rows}</ul></div>`;
}

function openModal(b) {
  const overlay = document.getElementById('overlay');
  const modalBody = document.getElementById('modalBody');
  modalBody.innerHTML = `
    ${coverHTML(b, true)}
    <div class="modal-info">
      <h2>${esc(b.title)}</h2>
      <div class="by">by ${esc(b.authorLine) || "Unknown"}</div>
      <div class="pills">
        ${b.shelves.map(s => `<span class="pill shelfpill">${esc(s)}</span>`).join("")}
        ${b.isRead ? '<span class="pill readpill">Read ✓</span>' : ''}
        ${b.rating != null ? `<span class="pill ratepill">${starsHTML(b.rating)}</span>` : ''}
        ${b.genre ? `<span class="pill">${esc(b.genre)}</span>` : ''}
      </div>
      <div class="facts">
        ${b.seriesLine ? `<div><b>Series:</b> ${esc(b.seriesLine)}</div>` : ''}
        ${b.pages ? `<div><b>Pages:</b> ${b.pages}</div>` : ''}
        ${b.format ? `<div><b>Format:</b> ${esc(b.format)}</div>` : ''}
        ${b.isbn ? `<div><b>ISBN:</b> ${esc(b.isbn)}</div>` : ''}
        ${b.id ? `<div><b>ID:</b> ${esc(b.id)} - ${esc(b.bookUuid)}</div>` : ''}
      </div>
      ${b.description ? `<div class="desc">${b.description}</div>` : ''}
      ${b.anth.length ? `<div class="anth"><h4>Stories inside this one</h4><ol>${
        b.anth.map(t => `<li><b>${esc(t.title)}</b>${t.author ? ` — ${esc(t.author)}` : ""}</li>`).join("")
      }</ol></div>` : ''}
      ${readingHistoryHTML(b)}
    </div>`;
  overlay.classList.add('open');
  document.getElementById('close').focus();
}

function wireModal() {
  const overlay = document.getElementById('overlay');
  document.getElementById('close').addEventListener('click', () => overlay.classList.remove('open'));
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') overlay.classList.remove('open'); });
}

/* ---------- loading / error ---------- */
function showLoading(el) {
  el.innerHTML = `<div class="loading"><img src="assets/logo.png" alt="" class="bounce"><p>The dinosaur is fetching the books…</p></div>`;
}
function showError(el, err) {
  el.innerHTML = `<div class="loaderr"><p><b>Hmm — the bookshelf didn't answer.</b></p>
  <p>${esc(err.message || err)}</p><p>Check your internet connection and refresh the page.</p></div>`;
}
