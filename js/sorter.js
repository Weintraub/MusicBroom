let sorterCurrentPageTracks = [];
let sorterTotal = 0;
let sorterPlaylistId = null;
let pendingAddTrack = null;
let sorterPage = 0;
const SORTER_PAGE_SIZE = 50;

function renderSorterPlaylists() {
  const el = document.getElementById('sorter-playlists');
  const list = getFilteredSortedPlaylists();
  el.innerHTML = list.length === 0
    ? '<div class="empty-msg">No playlists found.</div>'
    : list.map(p => `
    <div class="playlist-card${p.id === sorterPlaylistId ? ' selected' : ''}" id="sp-${p.id}" onclick="selectMasterPlaylist('${p.id}')">
      <img class="playlist-img" src="${p.images && p.images[0] ? p.images[0].url : ''}" alt="" onerror="this.style.background='var(--bg4)';this.src=''">
      <div class="playlist-name">${esc(p.name)}</div>
      <div class="playlist-meta">${(p.tracks || p.items || {}).total} tracks</div>
    </div>
  `).join('');
}

function openPlaylistModal() {
  renderSorterPlaylists();
  document.getElementById('playlist-modal').classList.add('open');
}

function closePlaylistModal() {
  document.getElementById('playlist-modal').classList.remove('open');
}

async function selectMasterPlaylist(id) {
  document.querySelectorAll('#sorter-playlists .playlist-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('sp-' + id).classList.add('selected');
  sorterPlaylistId = id;
  closePlaylistModal();
  const pl = allPlaylists.find(p => p.id === id);
  if (pl) {
    document.getElementById('choose-playlist-btn').textContent = 'Change playlist';
    const nameEl = document.getElementById('selected-playlist-name');
    nameEl.textContent = pl.name;
    nameEl.style.display = '';
    sorterTotal = (pl.tracks || pl.items || {}).total || 0;
  }
  sorterCurrentPageTracks = [];
  sorterPage = 0;
  document.getElementById('sorter-tracks-wrap').style.display = '';
  document.getElementById('sorter-tracks').innerHTML = '<div class="spinner"></div>';
  document.getElementById('sorter-pagination').innerHTML = '';
  await loadCurrentPage();
}

async function loadCurrentPage() {
  const reverse = document.getElementById('sorter-sort').value === 'default-desc';
  const spotifyOffset = reverse
    ? Math.max(0, sorterTotal - (sorterPage + 1) * SORTER_PAGE_SIZE)
    : sorterPage * SORTER_PAGE_SIZE;

  document.getElementById('sorter-tracks').innerHTML = '<div class="spinner"></div>';
  document.getElementById('sorter-pagination').innerHTML = '';

  const r = await getAllPlaylistTracks(sorterPlaylistId, SORTER_PAGE_SIZE, spotifyOffset);
  sorterTotal = r.total;
  let tracks = r.items.filter(i => (i.item || i.track) && (i.item || i.track).id).map(i => i.item || i.track);
  if (reverse) {
    tracks = tracks.reverse();
    // Trim excess tracks on the last reverse page (when total isn't a multiple of page size)
    const pageTrackCount = sorterTotal - sorterPage * SORTER_PAGE_SIZE;
    if (pageTrackCount < SORTER_PAGE_SIZE) tracks = tracks.slice(tracks.length - pageTrackCount);
  }

  // Store playlist position on each track for display
  tracks.forEach((t, i) => {
    t._playlistPos = reverse
      ? sorterTotal - sorterPage * SORTER_PAGE_SIZE - i
      : sorterPage * SORTER_PAGE_SIZE + i + 1;
  });

  sorterCurrentPageTracks = tracks;
  renderSorterTracks();

  // Fetch genres progressively
  for (let i = 0; i < tracks.length; i += 5) {
    await Promise.all(tracks.slice(i, i+5).map(async t => {
      t._genres = await getGenreForTrack(t);
    }));
    renderSorterTracks();
  }

  // Update genre filter options
  const genres = [...new Set(sorterCurrentPageTracks.flatMap(t => t._genres || []))].sort();
  const sel = document.getElementById('sorter-genre-filter');
  const cur = sel.value;
  sel.innerHTML = '<option value="">All genres</option>' + genres.map(g => `<option value="${esc(g)}" ${g === cur ? 'selected' : ''}>${esc(g)}</option>`).join('');
}

function getFilteredSorterTracks() {
  const search = (document.getElementById('sorter-search').value || '').toLowerCase();
  const genreFilter = document.getElementById('sorter-genre-filter').value;
  return sorterCurrentPageTracks.filter(t => {
    if (search && !t.name.toLowerCase().includes(search) && !t.artists.map(a=>a.name.toLowerCase()).join(' ').includes(search)) return false;
    if (genreFilter && !(t._genres||[]).includes(genreFilter)) return false;
    return true;
  });
}

function renderSorterTracks() {
  const filtered = getFilteredSorterTracks();
  document.getElementById('sorter-tracks').innerHTML = filtered.length === 0
    ? '<div class="empty-msg">No tracks match filters.</div>'
    : filtered.map(t => {
      const isCurrent = t.id === currentlyPlayingTrackId;
      const isPlaying = isCurrent && playerIsPlaying;
      const playCol = isCurrent
        ? `<span class="track-play-icon active">${isPlaying ? '⏸' : '▶'}</span>`
        : `<span class="track-num">${t._playlistPos}</span><span class="track-play-icon">▶</span>`;
      return `
    <div class="track-row${isCurrent ? ' now-playing' : ''}" id="track-row-${esc(t.id)}">
      <div class="col-num track-play-col" onclick="playTrack('${esc(t.id)}')">${playCol}</div>
      <img class="track-art" src="${t.album && t.album.images && t.album.images[2] ? t.album.images[2].url : ''}" alt="" onerror="this.style.background='var(--bg4)';this.src=''">
      <div class="track-info">
        <div class="track-name">${esc(t.name)}</div>
        <div class="track-artist">${esc(t.artists.map(a=>a.name).join(', '))}</div>
      </div>
      <div style="width:300px;display:flex;flex-wrap:wrap;gap:4px;">${t._genres && t._genres.length ? t._genres.map(g=>`<span class="genre-pill has-genre">${esc(g)}</span>`).join('') : '<span class="genre-pill">—</span>'}</div>
      <div style="width:160px;">
        <button class="add-btn" id="add-${esc(t.id)}" onclick="openAddModal('${esc(t.id)}','${escJS(t.name)}')">+ Add to playlist</button>
      </div>
    </div>
  `}).join('');
  renderSorterPagination();
}

function renderSorterPagination() {
  const el = document.getElementById('sorter-pagination');
  if (!el) return;
  const totalPages = Math.max(1, Math.ceil(sorterTotal / SORTER_PAGE_SIZE));
  el.innerHTML = `
    <button class="btn-ghost" onclick="prevSorterPage()" ${sorterPage > 0 ? '' : 'disabled'}>← Prev</button>
    <span class="pagination-label">Page ${sorterPage + 1} of ${totalPages}</span>
    <button class="btn-ghost" onclick="nextSorterPage()" ${sorterPage < totalPages - 1 ? '' : 'disabled'}>Next →</button>
  `;
}

async function nextSorterPage() {
  const totalPages = Math.ceil(sorterTotal / SORTER_PAGE_SIZE);
  if (sorterPage < totalPages - 1) {
    sorterPage++;
    window.scrollTo(0, 0);
    await loadCurrentPage();
  }
}

async function prevSorterPage() {
  if (sorterPage > 0) {
    sorterPage--;
    window.scrollTo(0, 0);
    await loadCurrentPage();
  }
}

function filterSorterTracks() { renderSorterTracks(); }

async function changeSorterSort() {
  sorterPage = 0;
  if (sorterPlaylistId) await loadCurrentPage();
}

// ── MODAL ──
function renderModalPicker() {
  const picker = document.getElementById('modal-picker');
  if (!picker) return;
  let dest = allPlaylists.filter(p => p.id !== sorterPlaylistId);
  if (playlistBopOnly) dest = dest.filter(p => /bop$/i.test(p.name));
  dest = dest.slice().sort((a, b) => (b.tracks || b.items || {}).total - (a.tracks || a.items || {}).total);
  picker.innerHTML = dest.length === 0
    ? '<div class="empty-msg">No playlists found.</div>'
    : dest.map(p => `
    <div class="picker-row" onclick="addTrackToPlaylist('${p.id}','${escJS(p.name)}')">
      <img class="picker-img" src="${p.images && p.images[0] ? p.images[0].url : ''}" alt="" onerror="this.style.background='var(--bg4)';this.src=''">
      <div>
        <div class="picker-name">${esc(p.name)}</div>
        <div class="picker-meta">${(p.tracks || p.items || {}).total} tracks</div>
      </div>
    </div>
  `).join('');
}

function openAddModal(trackId, trackName) {
  pendingAddTrack = trackId;
  document.getElementById('modal-title').textContent = 'Add to playlist';
  document.getElementById('modal-sub').textContent = `"${trackName}" → choose a destination`;
  renderModalPicker();
  document.getElementById('modal').classList.add('open');
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
  pendingAddTrack = null;
}

async function addTrackToPlaylist(playlistId, playlistName) {
  const trackId = pendingAddTrack;
  closeModal();
  if (!trackId) return;
  const trackUri = `spotify:track:${trackId}`;
  try {
    const r = await api(`/playlists/${playlistId}/items`, 'POST', { uris: [trackUri] });
    if (r && r.snapshot_id) {
      showToast(`Added to "${playlistName}"`, 'ok');
      const btn = document.getElementById('add-' + trackId);
      if (btn) { btn.textContent = '✓ Added'; btn.classList.add('done'); btn.disabled = true; }
      const pl = allPlaylists.find(p=>p.id===playlistId);
      if (pl) { const t = pl.tracks || pl.items; if (t) t.total++; }
      const trackName = (sorterCurrentPageTracks.find(t => t.id === trackId) || {}).name || '';
      openRemovePrompt(trackId, trackName);
    } else {
      showToast('Error adding track', 'err');
    }
  } catch (e) {
    showToast(e.message || 'Error adding track', 'err');
  }
}

function openRemovePrompt(trackId, trackName) {
  const masterPl = allPlaylists.find(p => p.id === sorterPlaylistId);
  const masterName = masterPl ? masterPl.name : 'source playlist';
  document.getElementById('modal-title').textContent = 'Remove from source?';
  document.getElementById('modal-sub').textContent = `Remove "${trackName}" from "${masterName}"?`;
  const bopBtn = document.querySelector('.pl-filter-bop');
  if (bopBtn) bopBtn.style.display = 'none';
  document.getElementById('modal-picker').innerHTML = `
    <div style="display:flex;gap:10px;margin-top:8px;">
      <button class="btn-primary" onclick="removeTrackFromMaster('${esc(trackId)}','${escJS(trackName)}')">Yes, remove</button>
      <button class="btn-ghost" onclick="closeModal()">No, keep it</button>
    </div>
  `;
  document.getElementById('modal').classList.add('open');
}

async function removeTrackFromMaster(trackId, trackName) {
  closeModal();
  if (!trackId || !sorterPlaylistId) return;
  try {
    const r = await api(`/playlists/${sorterPlaylistId}/items`, 'DELETE', {
      items: [{ uri: `spotify:track:${trackId}` }]
    });
    if (r && r.snapshot_id) {
      showToast(`Removed "${trackName}" from source`, 'ok');
      const row = document.getElementById('track-row-' + trackId);
      if (row) row.remove();
      sorterCurrentPageTracks = sorterCurrentPageTracks.filter(t => t.id !== trackId);
      sorterTotal = Math.max(0, sorterTotal - 1);
      renderSorterPagination();
    } else {
      showToast('Error removing track', 'err');
    }
  } catch (e) {
    showToast(e.message || 'Error removing track', 'err');
  }
}

// ── PLAYER ──
let spotifyPlayer = null;
let spotifyDeviceId = null;
let playerCurrentState = null;
let playerSeekDragging = false;
let playerProgressInterval = null;
let currentlyPlayingTrackId = null;
let playerIsPlaying = false;

window.onSpotifyWebPlaybackSDKReady = () => {
  if (!accessToken) return;
  spotifyPlayer = new Spotify.Player({
    name: 'MusicBroom',
    getOAuthToken: cb => cb(accessToken),
    volume: 0.8
  });

  spotifyPlayer.addListener('ready', ({ device_id }) => {
    spotifyDeviceId = device_id;
  });

  spotifyPlayer.addListener('not_ready', () => {
    spotifyDeviceId = null;
  });

  spotifyPlayer.addListener('player_state_changed', state => {
    if (!state) return;
    playerCurrentState = state;
    const prevId = currentlyPlayingTrackId;
    const track = state.track_window.current_track;
    playerIsPlaying = !state.paused;
    currentlyPlayingTrackId = track.id;
    updatePlayerBar(state);
    if (prevId !== currentlyPlayingTrackId) renderSorterTracks();

    if (!state.paused && !playerProgressInterval) {
      playerProgressInterval = setInterval(tickPlayerProgress, 500);
    } else if (state.paused && playerProgressInterval) {
      clearInterval(playerProgressInterval);
      playerProgressInterval = null;
    }
  });

  spotifyPlayer.connect();
};

function tickPlayerProgress() {
  if (playerSeekDragging || !spotifyPlayer) return;
  spotifyPlayer.getCurrentState().then(s => {
    if (s) updateSeekBar(s.position, s.duration);
  });
}

async function playTrack(trackId) {
  if (!spotifyDeviceId) { showToast('Player not ready', 'err'); return; }
  if (trackId === currentlyPlayingTrackId) {
    spotifyPlayer.togglePlay();
    return;
  }
  const r = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(spotifyDeviceId)}`, {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ uris: [`spotify:track:${trackId}`] })
  });
  if (r.status === 401) {
    showToast('Sign out and back in to enable playback', 'err');
    return;
  }
  if (r.status === 403) {
    const body = await r.json().catch(() => ({}));
    const reason = body?.error?.reason;
    if (reason === 'TRACK_NOT_PLAYABLE') {
      showToast('This track is unavailable (removed from Spotify)', 'err');
    } else {
      showToast('Sign out and back in to enable playback', 'err');
    }
    return;
  }
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    showToast(err?.error?.message || 'Playback error', 'err');
  }
}

function playerToggle() {
  if (spotifyPlayer) spotifyPlayer.togglePlay();
}

function playerSeekInput(val) {
  playerSeekDragging = true;
  if (playerCurrentState) {
    const pos = (val / 100) * playerCurrentState.duration;
    document.getElementById('player-time-cur').textContent = msToMin(pos);
    document.getElementById('player-seek').style.background =
      `linear-gradient(to right, var(--green) ${val}%, var(--bg4) ${val}%)`;
  }
}

function playerSeekCommit(val) {
  playerSeekDragging = false;
  if (spotifyPlayer && playerCurrentState) {
    const pos = Math.round((val / 100) * playerCurrentState.duration);
    spotifyPlayer.seek(pos);
  }
}

function updatePlayerBar(state) {
  const bar = document.getElementById('player-bar');
  if (!bar) return;
  bar.classList.add('visible');
  document.body.classList.add('player-active');

  const track = state.track_window.current_track;
  document.getElementById('player-track-name').textContent = track.name;
  document.getElementById('player-artist-name').textContent = track.artists.map(a => a.name).join(', ');
  const img = track.album.images[0];
  document.getElementById('player-art').src = img ? img.url : '';
  document.getElementById('player-playpause').textContent = state.paused ? '▶' : '⏸';
  updateSeekBar(state.position, state.duration);
}

function updateSeekBar(position, duration) {
  if (playerSeekDragging) return;
  const pct = duration > 0 ? (position / duration) * 100 : 0;
  const seekEl = document.getElementById('player-seek');
  if (!seekEl) return;
  seekEl.value = pct;
  seekEl.style.background = `linear-gradient(to right, var(--green) ${pct}%, var(--bg4) ${pct}%)`;
  document.getElementById('player-time-cur').textContent = msToMin(position);
  document.getElementById('player-time-dur').textContent = msToMin(duration);
}

initApp();
