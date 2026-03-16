// ── CONFIG & SHARED STATE ──
const SCOPES = [
  'user-read-private','user-read-email',
  'playlist-read-private','playlist-read-collaborative',
  'playlist-modify-public','playlist-modify-private',
  'user-top-read','user-read-recently-played'
].join(' ');

let CLIENT_ID = localStorage.getItem('mb_client_id') || '';
let accessToken = sessionStorage.getItem('mb_token');
let currentUserId = null;
let playlistFilter = 'all'; // 'all' | 'mine'
let playlistSort = 'default'; // 'default' | 'tracks-asc' | 'tracks-desc'
let allPlaylists = [];
let genreCache = {};

// ── API ──
async function api(path, method='GET', body=null) {
  const opts = {
    headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    method
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch('https://api.spotify.com/v1' + path, opts);
  if (r.status === 401) { sessionStorage.removeItem('mb_token'); location.href = 'index.html'; }
  if (r.status === 204) return null;
  return r.json();
}

async function getAllPlaylistTracks(playlistId, limit=100, offset=0) {
  return api(`/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}&fields=total,next,items(track(id,name,duration_ms,artists,album(images)))`);
}

// ── GENRE (via artist) ──
async function getGenreForTrack(track) {
  if (!track || !track.artists || !track.artists[0]) return null;
  const artistId = track.artists[0].id;
  if (genreCache[artistId] !== undefined) return genreCache[artistId];
  try {
    const a = await api(`/artists/${artistId}`);
    const genre = (a.genres && a.genres[0]) ? a.genres[0] : null;
    genreCache[artistId] = genre;
    return genre;
  } catch { return null; }
}

// ── PLAYLIST FILTER / SORT ──
function getFilteredSortedPlaylists() {
  let list = allPlaylists;
  if (playlistFilter === 'mine') {
    list = list.filter(p => p.owner && p.owner.id === currentUserId);
  }
  if (playlistSort === 'tracks-asc') {
    list = list.slice().sort((a, b) => (a.tracks || a.items || {}).total - (b.tracks || b.items || {}).total);
  } else if (playlistSort === 'tracks-desc') {
    list = list.slice().sort((a, b) => (b.tracks || b.items || {}).total - (a.tracks || a.items || {}).total);
  }
  return list;
}

function setPlaylistFilter(val) {
  playlistFilter = val;
  document.querySelectorAll('.pl-filter-mine').forEach(btn => btn.classList.toggle('active', val === 'mine'));
  if (typeof renderAnalyzerPlaylists === 'function') renderAnalyzerPlaylists();
  if (typeof renderSorterPlaylists === 'function') renderSorterPlaylists();
}

function setPlaylistSort(val) {
  playlistSort = val;
  document.querySelectorAll('.pl-sort-select').forEach(sel => sel.value = val);
  if (typeof renderAnalyzerPlaylists === 'function') renderAnalyzerPlaylists();
  if (typeof renderSorterPlaylists === 'function') renderSorterPlaylists();
}

// ── LOAD PLAYLISTS ──
async function loadPlaylists() {
  let items = [];
  let offset = 0;
  while (true) {
    const r = await api(`/me/playlists?limit=50&offset=${offset}`);
    if (!r || !r.items) break;
    items = items.concat(r.items);
    if (!r.next || r.items.length < 50) break;
    offset += 50;
  }
  allPlaylists = items.filter(p => p && p.id);
  if (typeof renderAnalyzerPlaylists === 'function') renderAnalyzerPlaylists();
  if (typeof renderSorterPlaylists === 'function') renderSorterPlaylists();
}

// ── APP INIT (called by each app page) ──
async function initApp() {
  if (!accessToken) { location.href = 'index.html'; return; }
  const me = await api('/me');
  currentUserId = me.id;
  document.getElementById('user-name').textContent = me.display_name || me.id;
  if (me.images && me.images[0]) {
    const av = document.getElementById('user-avatar');
    av.src = me.images[0].url;
    av.style.display = '';
  }
  await loadPlaylists();
}

// ── UTILS ──
function msToHM(ms) {
  const h = Math.floor(ms/3600000);
  const m = Math.floor((ms%3600000)/60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function msToMin(ms) {
  const m = Math.floor(ms/60000);
  const s = Math.floor((ms%60000)/1000);
  return `${m}:${s.toString().padStart(2,'0')}`;
}
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function showToast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + type;
  void t.offsetWidth;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 3000);
}
