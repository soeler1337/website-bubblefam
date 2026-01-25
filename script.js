/* BubbleFam SPA + Live Dashboard + Supabase Auth (Twitch) */

let allStreams = [];
let liveAvatarMap = {};
let homeInterval = null;

// --- Config helpers (compat with streamer-config.js using const/let) ---
function getStreamerList() {
  // streamer-config.js defines `const streamerList = [...]` which is NOT on window.
  // So we support both: window.streamerList (preferred) and global binding streamerList.
  if (Array.isArray(window.streamerList)) return window.streamerList;
  try {
    // eslint-disable-next-line no-undef
    if (typeof streamerList !== "undefined" && Array.isArray(streamerList)) return streamerList;
  } catch (e) {}
  return [];
}
function getRdwByWeek() {
  if (window.rdwByWeek && typeof window.rdwByWeek === "object") return window.rdwByWeek;
  try {
    // eslint-disable-next-line no-undef
    if (typeof rdwByWeek !== "undefined" && typeof rdwByWeek === "object") return rdwByWeek;
  } catch (e) {}
  return {};
}

// --- Supabase init (UMD) ---
let sb = null;
function initSupabase() {
  try {
    const cfg = window.APP_CONFIG || {};
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
      console.warn("APP_CONFIG fehlt (config.public.js nicht geladen?)");
      return null;
    }
    if (!window.supabase?.createClient) {
      console.warn("Supabase JS nicht geladen.");
      return null;
    }
	return window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
		auth: {
			persistSession: true,
			autoRefreshToken: true,
			detectSessionInUrl: true,
			flowType: "pkce",
		},
	});
  } catch (e) {
    console.error("Supabase init error", e);
    return null;
  }
}

// --- Twitch streams (existing) ---
async function fetchStreams() {
  const usernames = (getStreamerList())
    .map(s => s.twitchName?.toLowerCase().split('?')[0])
    .filter(Boolean);

  const response = await fetch('https://soeler-twitch-proxy.vercel.app/api/streamers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames })
  });

  const data = await response.json();
  allStreams = data.streams || [];
}

async function loadStatus() {
  const table = document.getElementById('streamer-table');
  if (table) {
    table.innerHTML = '<tr><td colspan="6">Lade…</td></tr>';
  }

  await fetchStreams();

  // Try to resolve avatars for live users (approved members).
  try {
    const logins = (allStreams || []).map(s => s && s.user_login).filter(Boolean);
    liveAvatarMap = await fetchApprovedAvatarMap(logins);
  } catch (e) { /* ignore */ }

  // Always keep the carousel in sync (Home)
  renderLiveCarousel(allStreams);

  // Table only exists/visible in Mitglieder
  if (!table) return;

  const liveMap = {};
  (allStreams || []).forEach(s => {
    if (!s || !s.user_login) return;
    liveMap[String(s.user_login).toLowerCase()] = s;
  });

  const currentKW = getCalendarWeek();
  const rdwByWeek = getRdwByWeek() || {};
  const rdwList = (rdwByWeek[currentKW] || []).map(x => String(x).toLowerCase());

  table.innerHTML = '';
  (getStreamerList()).forEach(s => {
    const username = String(s.twitchName || '').toLowerCase().split('?')[0];
    if (!username) return;

    const live = liveMap[username];
    const isRDW = rdwList.includes(username);

    const tr = document.createElement('tr');
    tr.className = (live ? 'online' : 'offline') + ' selectable-row';
    if (isRDW) tr.classList.add('rdw-highlight');

    tr.innerHTML = `
      <td><span class="status-dot ${live ? 'online-dot' : 'offline-dot'}"></span>${live ? 'Online' : 'Offline'}</td>
      <td>${escapeHtml(username)}</td>
      <td>${live ? escapeHtml(live.title) : ''}</td>
      <td>${live ? escapeHtml(live.game_name) : ''}</td>
      <td>${isRDW ? "⭐ RDW" : ""}</td>
      <td><a class="live-link" href="https://www.twitch.tv/${username}" target="_blank" rel="noopener">Twitch</a></td>
    `;

    tr.addEventListener('click', (ev) => {
      const a = ev.target && ev.target.closest ? ev.target.closest('a') : null;
      if (a) return;
      openMemberModal(username);
    });

    table.appendChild(tr);
  });

  sortTable(0);
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[s]));
}

function filterTable() {
  const input = (document.getElementById("searchInput")?.value || "").toLowerCase();
  const rows = document.getElementById("streamer-table")?.getElementsByTagName("tr") || [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(input) ? "" : "none";
  }
  sortTable(0);
}

function sortTable(n) {
  const table = document.getElementById("streamTable");
  if (!table) return;
  let switching = true;
  let dir = "desc";
  let switchcount = 0;
  while (switching) {
    switching = false;
    const rows = table.rows;
    for (let i = 1; i < rows.length - 1; i++) {
      const x = rows[i].getElementsByTagName("TD")[n];
      const y = rows[i + 1].getElementsByTagName("TD")[n];
      let shouldSwitch = false;
      if (dir === "asc" && x.textContent.toLowerCase() > y.textContent.toLowerCase()) shouldSwitch = true;
      if (dir === "desc" && x.textContent.toLowerCase() < y.textContent.toLowerCase()) shouldSwitch = true;
      if (shouldSwitch) {
        rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
        switching = true;
        switchcount++;
        break;
      }
    }
    if (!switching && switchcount === 0 && dir === "desc") {
      dir = "asc";
      switching = true;
    }
  }
}

function getCalendarWeek() {
  const date = new Date();
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// --- RDW filter (works on rendered table) ---
let rdwOnly = false;
function filterRDW() {
  rdwOnly = true;
  applyRDWFilter();
}
function clearRDWFilter() {
  rdwOnly = false;
  applyRDWFilter();
}
function applyRDWFilter() {
  const rows = document.getElementById("streamer-table")?.getElementsByTagName("tr") || [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!rdwOnly) { row.style.display = ""; continue; }
    row.style.display = row.classList.contains("rdw-highlight") ? "" : "none";
  }
}

// --- Lurk popup (existing) ---
function showPopup() {
  const onlineRows = document.querySelectorAll('tr.online');
  if (onlineRows.length === 0) { alert("Es sind derzeit keine Streamer online."); return; }

  const overlay = document.createElement('div');
  overlay.style = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background-color: #37153A;
      padding: 2rem;
      border-radius: 12px;
      z-index: 9999;
      max-height: 90vh;
      overflow-y: auto;
      width: 90%;
      max-width: 900px;
      box-shadow: 0 0 10px rgba(0,0,0,0.3);
  `;

  const box = document.createElement('div');
  box.innerHTML = `
    <h2 style="margin-top: 0;">Online-Streams</h2>
    <div id="stream-select-list" style="margin-bottom: 1rem;"></div>
    <div style="margin-top: 1rem;">
      <button class="popup-btn" id="select-toggle">Alle abwählen</button>
      <button class="popup-btn" id="open-selected">Jetzt Lurken</button>
      <button class="popup-btn" id="close-popup">Schließen</button>
    </div>
  `;

  overlay.id = 'popup-overlay';
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  document.getElementById('close-popup').onclick = () => {
    const el = document.getElementById('popup-overlay');
    if (el) document.body.removeChild(el);
  };

  const list = document.getElementById('stream-select-list');
  const selectedRows = new Set();

  onlineRows.forEach(row => {
    const name = row.querySelector('td:nth-child(2)')?.textContent.trim();
    const url = row.querySelector('a')?.href;
    if (name && url) {
      const entry = document.createElement('div');
      entry.className = 'popup-stream-entry';
      entry.textContent = name;
      entry.style = `
        padding: 0.5rem 1rem;
        border-radius: 8px;
        margin-bottom: 0.5rem;
        cursor: pointer;
        background-color: rgba(150, 221, 220, 0.15);
        transition: background-color 0.2s;
      `;

      entry.onclick = () => {
        if (selectedRows.has(url)) {
          selectedRows.delete(url);
          entry.style.backgroundColor = 'rgba(150, 221, 220, 0.15)';
        } else {
          selectedRows.add(url);
          entry.style.backgroundColor = 'var(--thulian-pink)';
        }
      };

      selectedRows.add(url);
      entry.style.backgroundColor = 'var(--thulian-pink)';
      list.appendChild(entry);
    }
  });

  const toggleButton = document.getElementById('select-toggle');
  toggleButton.onclick = () => {
    const allSelected = selectedRows.size === list.children.length;
    selectedRows.clear();
    [...list.children].forEach((entryEl, idx) => {
      const url = onlineRows[idx]?.querySelector('a')?.href;
      if (!allSelected && url) {
        selectedRows.add(url);
        entryEl.style.backgroundColor = 'var(--thulian-pink)';
      } else {
        entryEl.style.backgroundColor = 'rgba(150, 221, 220, 0.15)';
      }
    });
    toggleButton.textContent = allSelected ? "Alle auswählen" : "Alle abwählen";
  };

  document.getElementById('open-selected').onclick = () => {
    if (selectedRows.size === 0) return;
    [...selectedRows].forEach(url => window.open(url, '_blank', 'noopener'));
  };
}

// --- Live carousel rendering ---
function initialsFromLogin(login) {
  const s = (login || "").replace(/[^a-z0-9_]/gi, "").toUpperCase();
  if (!s) return "?";
  if (s.length === 1) return s;
  return s.slice(0, 2);
}

function isRDWLogin(login) {
  const username = (login || "").toLowerCase();
  const currentKW = getCalendarWeek();
  const rdwList = (getRdwByWeek() && getRdwByWeek()[currentKW]) ? getRdwByWeek()[currentKW] : [];
  return rdwList.includes(username);
}

function renderLiveCarousel() {
  const root = document.getElementById('live-carousel');
  const track = document.getElementById('live-carousel-track');
  if (!root || !track) return;

  const currentKW = getCalendarWeek();
  const rdwList = ((getRdwByWeek() || {})[currentKW] || []).map(x => String(x).toLowerCase());

  const live = (allStreams || [])
    .filter(s => s && s.user_login)
    .map(s => {
      const login = String(s.user_login).toLowerCase();
      const display = s.user_name || s.user_login;
      const avatarUrl = liveAvatarMap && liveAvatarMap[login] ? String(liveAvatarMap[login]) : '';
      return {
        login,
        display,
        title: s.title || '',
        game: s.game_name || '',
        viewers: Number.isFinite(s.viewer_count) ? s.viewer_count : null,
        thumb: s.thumbnail_url ? String(s.thumbnail_url).replace('{width}', '440').replace('{height}', '248') : '',
        isRDW: rdwList.includes(login),
        avatarUrl
      };
    });

  if (live.length === 0) {
    root.hidden = true;
    track.innerHTML = '';
    return;
  }

  live.sort((a, b) => {
    if (a.isRDW !== b.isRDW) return a.isRDW ? -1 : 1;
    const av = a.viewers ?? -1;
    const bv = b.viewers ?? -1;
    if (av !== bv) return bv - av;
    return a.login.localeCompare(b.login);
  });

  track.innerHTML = '';
  for (const s of live) {
    const card = document.createElement('article');
    card.className = 'live-card';
    card.setAttribute('role', 'listitem');

    const initials = getInitials(s.display);

    card.innerHTML = `
      <a class="live-card-link" href="https://www.twitch.tv/${s.login}" target="_blank" rel="noopener">
        <div class="live-card-media" ${s.thumb ? `style="background-image:url('${s.thumb}')"` : ''} aria-hidden="true"></div>
        <div class="live-card-body">
          <div class="live-card-top">
            <div class="live-card-name">
              <span class="live-avatar">${s.avatarUrl ? `<img class="live-avatar-img" src="${escapeHtml(s.avatarUrl)}" alt="" />` : escapeHtml(initials)}</span>
			  ${s.isRDW ? ' <span class="badge">Raid der Woche</span>' : ''}
              <span class="live-name-text">${escapeHtml(s.display)}</span>
            </div>
            <div class="live-card-meta">${s.viewers != null ? `${s.viewers} 👀` : ''}</div>
          </div>
          <div class="live-card-title" title="${escapeHtml(s.title)}">${escapeHtml(s.title)}</div>
          <div class="live-card-game">${escapeHtml(s.game)}</div>
        </div>
      </a>
    `;

    track.appendChild(card);
  }

  root.hidden = false;

  // Wire carousel buttons (desktop)
  const prev = document.getElementById('live-prev');
  const next = document.getElementById('live-next');
  const scrollBy = () => Math.max(240, track.clientWidth * 0.9);
  if (prev && !prev.dataset.wired) {
    prev.dataset.wired = '1';
    prev.addEventListener('click', () => track.scrollBy({ left: -scrollBy(), behavior: 'smooth' }));
  }
  if (next && !next.dataset.wired) {
    next.dataset.wired = '1';
    next.addEventListener('click', () => track.scrollBy({ left: scrollBy(), behavior: 'smooth' }));
  }
}
function wireProfileBasics() {
  const form = document.getElementById("profile-basics-form");
  if (!form || form.dataset.wired) return;
  form.dataset.wired = "1";

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!sb || !currentSession?.user) return;

    const hint = document.getElementById("profile-save-hint");
    if (hint) hint.textContent = "Speichere…";

    const displayName = (document.getElementById("profile-displayname")?.value || "").trim();
    const file = document.getElementById("profile-avatar-file")?.files?.[0] || null;

    // 1) optional avatar upload
    let newAvatarUrl = null;
    if (file) {
      newAvatarUrl = await uploadAvatarToStorage(file);
    }

    // 2) update members row (only fields that exist)
    const patch = {};
    if (displayName) patch.display_name = displayName;
    if (newAvatarUrl) patch.avatar_url = newAvatarUrl;

    if (Object.keys(patch).length) {
      const { error } = await sb.from("members")
        .update(patch)
        .eq("user_id", currentSession.user.id);

      if (error) {
        console.warn(error);
        if (hint) hint.textContent = "Konnte nicht speichern.";
        return;
      }
    }

    await loadMemberRow();        // refresh currentMemberRow
    await refreshSession();       // keeps badge consistent
    await loadProfileView();      // re-render UI
    if (hint) hint.textContent = "Gespeichert ✅";
  };
}
async function uploadAvatarToStorage(file) {
  if (!sb || !currentSession?.user) return null;

  // simple validation
  const maxMB = 2;
  if (file.size > maxMB * 1024 * 1024) {
    alert(`Avatar ist zu groß (max ${maxMB}MB).`);
    return null;
  }

  const userId = currentSession.user.id;
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${userId}.${ext}`;

  // upload (upsert = überschreiben)
  const { error: upErr } = await sb.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (upErr) {
    console.warn(upErr);
    alert("Upload fehlgeschlagen. (Storage Policy / Bucket?)");
    return null;
  }

  // public URL
  const { data } = sb.storage.from("avatars").getPublicUrl(path);
  return data?.publicUrl || null;
}


// --- SPA Router ---
function setActiveNav(hash) {
  document.querySelectorAll("[data-nav]").forEach(a => {
    const href = a.getAttribute("href") || "";
    a.classList.toggle("active", href === hash);
  });
}

function showView(viewName) {
  document.querySelectorAll("[data-view]").forEach(v => v.hidden = true);
  const el = document.querySelector(`[data-view="${viewName}"]`);
  if (el) el.hidden = false;
}

function route() {
  const hash = location.hash || "#/";
  setActiveNav(hash.startsWith("#/") ? (hash.startsWith("#/members") ? "#/members"
    : hash.startsWith("#/wiki") ? "#/wiki"
    : hash.startsWith("#/profile") ? "#/profile"
    : "#/") : "#/");

  const view =
    hash === "#/" ? "home" :
    hash.startsWith("#/members") ? "members" :
    hash.startsWith("#/wiki") ? "wiki" :
    hash.startsWith("#/profile") ? "profile" :
    hash.startsWith("#/auth") ? "auth" :
    "home";

  showView(view);

  if (view === "home") startHomePolling();
  else stopHomePolling();

  if (view === "members") { loadMembersPublic(); loadStatus(); }
  if (view === "profile") loadProfileView();
  if (view === "auth") handleAuthReturn();
}

function startHomePolling() {
  loadStatus();
  if (homeInterval) return;
  homeInterval = setInterval(() => {
    // only refresh if we are still on home
    if ((location.hash || "#/") === "#/") loadStatus();
  }, 5 * 60 * 1000);
}


// --- Member detail modal (public) ---
function getInitials(name) {
  const n = String(name || '').trim();
  if (!n) return '?';
  const parts = n.split(/\s+/).slice(0, 2);
  return parts.map(p => (p[0] || '').toUpperCase()).join('') || n[0].toUpperCase();
}

async function fetchApprovedAvatarMap(logins) {
  const map = {};
  const unique = Array.from(new Set((logins || []).map(x => String(x).toLowerCase()))).filter(Boolean);
  if (!unique.length) return map;
  if (!sb) return map;
  try {
    const { data } = await sb.from('members')
      .select('twitch_login,avatar_url,status')
      .in('twitch_login', unique)
      .eq('status', 'approved');
    (data || []).forEach(row => {
      const key = String(row.twitch_login || '').toLowerCase();
      if (key && row.avatar_url) map[key] = String(row.avatar_url);
    });
  } catch (e) {
    // ignore
  }
  return map;
}

async function openMemberModal(login) {
  const overlay = document.getElementById('member-modal');
  const body = document.getElementById('member-modal-body');
  const title = document.getElementById('member-modal-title');
  if (!overlay || !body || !title) return;

  const closeBtn = document.getElementById('member-modal-close');
  const close = () => {
    overlay.hidden = true;
    overlay.dataset.open = '';
  };

  if (!overlay.dataset.wired) {
    overlay.dataset.wired = '1';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    closeBtn?.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.dataset.open === '1') close();
    });
  }

  overlay.hidden = false;
  overlay.dataset.open = '1';
  title.textContent = '@' + login;
  body.innerHTML = '<div class="muted">Lade…</div>';

  const live = (allStreams || []).find(s => String(s?.user_login || '').toLowerCase() === String(login).toLowerCase()) || null;

  // Public member profile (only if approved)
  let member = null;
  let socials = [];
  let schedule = [];

  try {
    if (sb) {
      const { data: m } = await sb.from('members')
        .select('user_id,twitch_login,display_name,avatar_url,status')
        .eq('twitch_login', login)
        .eq('status', 'approved')
        .maybeSingle();
      member = m || null;

      if (member?.user_id) {
        const { data: s1 } = await sb.from('member_socials')
          .select('platform,url')
          .eq('user_id', member.user_id)
          .order('platform', { ascending: true });
        socials = s1 || [];

        const { data: s2 } = await sb.from('stream_schedule')
          .select('weekday,start_time,end_time,notes')
          .eq('user_id', member.user_id)
          .order('weekday', { ascending: true })
          .order('start_time', { ascending: true });
        schedule = s2 || [];
      }
    }
  } catch (e) {
    // ignore
  }

  const display = member?.display_name || live?.user_name || login;
  const avatarUrl = member?.avatar_url || '';

  const liveBox = live ? `
    <div class="status-box ok">
      <div class="modal-live-top">
        <b>LIVE</b>
        <span class="muted">${Number.isFinite(live.viewer_count) ? `${live.viewer_count} Zuschauer` : ''}</span>
      </div>
      <div class="modal-live-title">${escapeHtml(live.title || '')}</div>
      <div class="muted">${escapeHtml(live.game_name || '')}</div>
      <a class="live-link" href="https://www.twitch.tv/${login}" target="_blank" rel="noopener">Stream öffnen</a>
    </div>
  ` : `
    <div class="status-box">
      <div class="muted">Gerade offline.</div>
      <a class="live-link" href="https://www.twitch.tv/${login}" target="_blank" rel="noopener">Twitch öffnen</a>
    </div>
  `;

  const socialsBox = (socials && socials.length) ? `
    <h3>Socials</h3>
    <div class="modal-socials">
      ${socials.map(s => `
        <a class="pill" href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.platform)}</a>
      `).join('')}
    </div>
  ` : `
    <h3>Socials</h3>
    <div class="muted">Noch keine Links hinterlegt.</div>
  `;

  const scheduleBox = (schedule && schedule.length) ? `
    <h3>Streamplan</h3>
    <div class="modal-schedule">
      ${schedule.map(it => {
        const day = weekdayLabel(it.weekday);
        const time = `${it.start_time}${it.end_time ? '–'+it.end_time : ''}`;
        const notes = it.notes ? `<div class="muted small">${escapeHtml(it.notes)}</div>` : '';
        return `<div class="list-item"><div><b>${day} ${escapeHtml(time)}</b>${notes}</div></div>`;
      }).join('')}
    </div>
  ` : `
    <h3>Streamplan</h3>
    <div class="muted">Noch kein Plan hinterlegt.</div>
  `;

  const profileHint = member ? '' : '<div class="notice">Für dieses Profil sind noch keine Member-Infos hinterlegt. Sobald die Person eingeloggt + freigeschaltet ist, erscheinen hier Avatar/Socials/Plan.</div>';

  body.innerHTML = `
    <div class="modal-head">
      <div class="modal-avatar">
        ${avatarUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="" />` : `<span>${escapeHtml(getInitials(display))}</span>`}
      </div>
      <div>
        <div class="profile-name">${escapeHtml(display)}</div>
        <div class="muted small">@${escapeHtml(login)}</div>
      </div>
    </div>
    ${profileHint}
    ${liveBox}
    ${socialsBox}
    ${scheduleBox}
  `;
}
function stopHomePolling() {
  if (homeInterval) {
    clearInterval(homeInterval);
    homeInterval = null;
  }
}

// --- Auth / Members ---
let currentSession = null;
let currentMemberRow = null;

function updateAuthBadge() {
  const badge = document.getElementById("nav-auth-badge");
  if (!badge) return;
  if (!currentSession?.user) { badge.textContent = ""; return; }
  const st = currentMemberRow?.status || "pending";
  badge.textContent = st === "approved" ? "✅" : "⏳";
  badge.title = st;
}

function redirectToProfile() {
  location.hash = "#/profile";
}

function getRedirectTo() {
  // preserve custom domain + potential subpath
  const base = window.location.origin + window.location.pathname;
  return base + "?auth=1";
}

async function handleAuthReturn() {
  // after OAuth redirect, Supabase should have stored session
  await refreshSession();
  redirectToProfile();
}

async function refreshSession() {
  if (!sb) return;
  const { data } = await sb.auth.getSession();
  currentSession = data?.session || null;

  if (!currentSession?.user) {
    currentMemberRow = null;
    updateAuthBadge();
    return;
  }

  await ensureMemberRow(currentSession.user);
  await loadMemberRow();
  updateAuthBadge();
}

function extractTwitchMeta(user) {
  const md = user?.user_metadata || {};
  const login = md.preferred_username || md.user_name || md.login || md.name || "";
  const display = md.full_name || md.name || md.preferred_username || login || "Member";
  const avatar = md.avatar_url || md.picture || md.profile_image_url || "";
  return { login, display, avatar };
}

async function ensureMemberRow(user) {
  if (!sb) return;
  const { login, display, avatar } = extractTwitchMeta(user);
  // try insert (will fail if exists)
  const payload = { user_id: user.id, twitch_login: (login || "").toLowerCase(), display_name: display, avatar_url: avatar };
  await sb.from("members").insert(payload).select().maybeSingle();
}

async function loadMemberRow() {
  if (!sb || !currentSession?.user) return;
  const { data } = await sb.from("members").select("*").eq("user_id", currentSession.user.id).maybeSingle();
  currentMemberRow = data || null;
}

async function loginWithTwitch() {
  if (!sb) return alert("Login gerade nicht verfügbar (Supabase init fehlgeschlagen).");
  await sb.auth.signInWithOAuth({
    provider: "twitch",
    options: { redirectTo: getRedirectTo() }
  });
}

async function logout() {
  if (!sb) return;
  await sb.auth.signOut();
  currentSession = null;
  currentMemberRow = null;
  updateAuthBadge();
  route();
}

function setElHidden(id, hidden) {
  const el = document.getElementById(id);
  if (el) el.hidden = hidden;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setPill(id, text, variant) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.dataset.variant = variant || "";
}

function setAvatar(el, avatarUrl, fallbackText) {
  if (!el) return;
  el.textContent = "";
  el.style.backgroundImage = "";
  if (avatarUrl) {
    el.style.backgroundImage = `url('${avatarUrl}')`;
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
  } else {
    el.textContent = fallbackText || "?";
  }
}

async function loadProfileView() {
  setElHidden("auth-loading", false);
  setElHidden("auth-logged-out", true);
  setElHidden("auth-logged-in", true);

  await refreshSession();

  setElHidden("auth-loading", true);

  if (!currentSession?.user) {
    setElHidden("auth-logged-out", false);
    const btn = document.getElementById("btn-login");
    if (btn) btn.onclick = loginWithTwitch;
    return;
  }

  setElHidden("auth-logged-in", false);

  const meta = extractTwitchMeta(currentSession.user);
  setText("profile-name", meta.display);
  setText("profile-login", meta.login ? `@${meta.login}` : "");
  const status = currentMemberRow?.status || "pending";
  const role = currentMemberRow?.role || "member";

  setPill("profile-status", status, status);
  const roleEl = document.getElementById("profile-role");
  if (roleEl) {
    roleEl.hidden = role !== "admin";
    roleEl.textContent = role === "admin" ? "admin" : "";
  }

  const preferredAvatar = currentMemberRow?.avatar_url || meta.avatar || "";
  setAvatar(document.getElementById("profile-avatar"), preferredAvatar, initialsFromLogin(meta.login));

  const openTwitch = document.getElementById("btn-open-twitch");
  if (openTwitch) openTwitch.href = meta.login ? `https://www.twitch.tv/${meta.login}` : "https://www.twitch.tv/";

  const btnLogout = document.getElementById("btn-logout");
  if (btnLogout) btnLogout.onclick = logout;

  const approved = status === "approved";
  setElHidden("profile-pending", approved);
  setElHidden("profile-approved", !approved);

  // Show login hint in members view if pending
  const hint = document.getElementById("members-login-hint");
  if (hint) hint.hidden = approved;

  if (approved) {
	// preload basics into form
	const dn = document.getElementById("profile-displayname");
	if (dn) dn.value = currentMemberRow?.display_name || meta.display || "";
	wireProfileBasics();
    wireSocials();
    wireSchedule();
    await loadSocials();
    await loadSchedule();
  }

  await loadAdminPanelsIfNeeded();
}

async function loadMembersPublic() {
  if (!sb) sb = initSupabase();
  // show hint if not logged in
  await refreshSession();
  const hint = document.getElementById("members-login-hint");
  if (hint) hint.hidden = !!currentSession?.user;

  // public list of approved members
  const grid = document.getElementById("members-grid");
  if (!grid) return;
  grid.innerHTML = "<div class='muted'>Lade…</div>";

  const { data, error } = await sb.from("members")
    .select("twitch_login,display_name,avatar_url,status")
    .eq("status","approved")
    .order("display_name", { ascending: true });

  if (error) {
    grid.innerHTML = "<div class='muted'>Konnte Mitglieder nicht laden.</div>";
    return;
  }

  grid.innerHTML = "";
  (data || []).forEach(m => {
    const card = document.createElement("div");
    card.className = "member-card";
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    setAvatar(avatar, m.avatar_url, initialsFromLogin(m.twitch_login));
    const info = document.createElement("div");
    info.innerHTML = `<div><b>${escapeHtml(m.display_name || m.twitch_login)}</b></div>
      <div class="muted small">@${escapeHtml(m.twitch_login || "")}</div>`;
    card.appendChild(avatar);
    card.appendChild(info);
    grid.appendChild(card);
  });

  await loadAdminPanelsIfNeeded();
}

async function loadAdminPanelsIfNeeded() {
  const panel = document.getElementById("admin-panel");
  if (!panel) return;
  const isAdmin = currentMemberRow?.role === "admin" && currentMemberRow?.status === "approved";
  panel.hidden = !isAdmin;
  if (!isAdmin) return;

  await loadPendingList();
  await loadWhitelist();

  const form = document.getElementById("whitelist-form");
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const login = (document.getElementById("whitelist-login")?.value || "").trim().toLowerCase();
      if (!login) return;
      await sb.from("whitelist").insert({ twitch_login: login });
      document.getElementById("whitelist-login").value = "";
      await loadWhitelist();
    };
  }
}

async function loadPendingList() {
  const wrap = document.getElementById("admin-pending");
  if (!wrap) return;
  wrap.innerHTML = "<div class='muted'>Lade…</div>";

  const { data } = await sb.from("members")
    .select("user_id,twitch_login,display_name,status,role")
    .eq("status","pending")
    .order("created_at", { ascending: false });

  wrap.innerHTML = "";
  if (!data || data.length === 0) {
    wrap.innerHTML = "<div class='muted'>Keine pending Anfragen.</div>";
    return;
  }

  data.forEach(m => {
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `
      <div>
        <b>${escapeHtml(m.display_name || m.twitch_login)}</b>
        <div class="muted small">@${escapeHtml(m.twitch_login || "")}</div>
      </div>
      <div class="button-row">
        <button type="button" data-approve>Approve</button>
        <button type="button" data-ban>Ban</button>
      </div>
    `;
    row.querySelector("[data-approve]").onclick = async () => {
      await sb.from("members").update({ status: "approved" }).eq("user_id", m.user_id);
      await loadPendingList();
      await loadMembersPublic();
    };
    row.querySelector("[data-ban]").onclick = async () => {
      await sb.from("members").update({ status: "banned" }).eq("user_id", m.user_id);
      await loadPendingList();
    };
    wrap.appendChild(row);
  });
}

async function loadWhitelist() {
  const wrap = document.getElementById("admin-whitelist");
  if (!wrap) return;
  wrap.innerHTML = "<div class='muted'>Lade…</div>";

  const { data } = await sb.from("whitelist").select("*").order("added_at", { ascending: false });
  wrap.innerHTML = "";
  if (!data || data.length === 0) {
    wrap.innerHTML = "<div class='muted'>Whitelist ist leer.</div>";
    return;
  }

  data.forEach(w => {
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `
      <div><b>@${escapeHtml(w.twitch_login)}</b></div>
      <button type="button" data-del>Entfernen</button>
    `;
    row.querySelector("[data-del]").onclick = async () => {
      await sb.from("whitelist").delete().eq("twitch_login", w.twitch_login);
      await loadWhitelist();
    };
    wrap.appendChild(row);
  });
}

// --- Social links (approved) ---
function wireSocials() {
  const form = document.getElementById("social-form");
  if (!form || form.dataset.wired) return;
  form.dataset.wired = "1";
  form.onsubmit = async (e) => {
    e.preventDefault();
    const platform = document.getElementById("social-platform")?.value;
    const url = (document.getElementById("social-url")?.value || "").trim();
    if (!platform || !url) return;
    await sb.from("member_socials").upsert({
      user_id: currentSession.user.id,
      platform,
      url
    }, { onConflict: "user_id,platform" });
    document.getElementById("social-url").value = "";
    await loadSocials();
  };
}

async function loadSocials() {
  const wrap = document.getElementById("social-list");
  if (!wrap) return;
  wrap.innerHTML = "<div class='muted'>Lade…</div>";
  const { data, error } = await sb.from("member_socials")
    .select("platform,url")
    .eq("user_id", currentSession.user.id)
    .order("platform", { ascending: true });

  if (error) { wrap.innerHTML = "<div class='muted'>Konnte Socials nicht laden.</div>"; return; }
  wrap.innerHTML = "";
  (data || []).forEach(item => {
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `
      <div><b>${escapeHtml(item.platform)}</b><div class="muted small">${escapeHtml(item.url)}</div></div>
      <button type="button" data-del>Löschen</button>
    `;
    row.querySelector("[data-del]").onclick = async () => {
      await sb.from("member_socials").delete()
        .eq("user_id", currentSession.user.id)
        .eq("platform", item.platform);
      await loadSocials();
    };
    wrap.appendChild(row);
  });
}

// --- Schedule (approved) ---
function wireSchedule() {
  const form = document.getElementById("schedule-form");
  if (!form || form.dataset.wired) return;
  form.dataset.wired = "1";
  form.onsubmit = async (e) => {
    e.preventDefault();
    const weekday = parseInt(document.getElementById("schedule-weekday")?.value, 10);
    const start = document.getElementById("schedule-start")?.value;
    const end = document.getElementById("schedule-end")?.value || null;
    const notes = (document.getElementById("schedule-notes")?.value || "").trim() || null;
    if (!start || Number.isNaN(weekday)) return;

    await sb.from("stream_schedule").insert({
      user_id: currentSession.user.id,
      weekday,
      start_time: start,
      end_time: end,
      notes
    });
    document.getElementById("schedule-start").value = "";
    document.getElementById("schedule-end").value = "";
    document.getElementById("schedule-notes").value = "";
    await loadSchedule();
  };
}

const weekdayLabel = (d) => ["So","Mo","Di","Mi","Do","Fr","Sa"][d] || "?";

async function loadSchedule() {
  const wrap = document.getElementById("schedule-list");
  if (!wrap) return;
  wrap.innerHTML = "<div class='muted'>Lade…</div>";
  const { data, error } = await sb.from("stream_schedule")
    .select("id,weekday,start_time,end_time,notes")
    .eq("user_id", currentSession.user.id)
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) { wrap.innerHTML = "<div class='muted'>Konnte Streamplan nicht laden.</div>"; return; }
  wrap.innerHTML = "";
  (data || []).forEach(item => {
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `
      <div>
        <b>${weekdayLabel(item.weekday)} ${escapeHtml(item.start_time)}${item.end_time ? "–"+escapeHtml(item.end_time) : ""}</b>
        ${item.notes ? `<div class="muted small">${escapeHtml(item.notes)}</div>` : ""}
      </div>
      <button type="button" data-del>Entfernen</button>
    `;
    row.querySelector("[data-del]").onclick = async () => {
      await sb.from("stream_schedule").delete().eq("id", item.id);
      await loadSchedule();
    };
    wrap.appendChild(row);
  });
}
async function handleOAuthQueryReturn() {
  if (!sb) return;

  const url = new URL(window.location.href);
  const isAuthReturn = url.searchParams.has("code") || url.searchParams.has("error") || url.searchParams.has("auth");
  if (!isAuthReturn) return;

  // If we got an OAuth code, exchange it for a session
  const code = url.searchParams.get("code");
  if (code) {
    try {
      await sb.auth.exchangeCodeForSession(code);
    } catch (e) {
      console.warn("exchangeCodeForSession failed", e);
    }
  }

  await refreshSession();

  // Clean up URL (remove ?auth=1&code=... etc)
  url.search = "";
  history.replaceState({}, document.title, url.toString());

  // Go to profile (so UI updates immediately)
  location.hash = "#/profile";
}

// --- Boot ---
window.addEventListener("DOMContentLoaded", async () => {
  sb = initSupabase();
  await handleOAuthQueryReturn();
  // keep session fresh when auth state changes
  if (sb) {
    sb.auth.onAuthStateChange(async () => {
      await refreshSession();
      updateAuthBadge();
    });
  }

  window.addEventListener("hashchange", route);
  route(); // first render
  document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("member-modal");
  if (overlay) overlay.hidden = true;
});
});
