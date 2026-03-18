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
  const totalPages = Math.max(1, Math.ceil(sorterTotal / SORTER_PAGE_SIZE));
  const forwardPage = reverse ? (totalPages - 1 - sorterPage) : sorterPage;
  const spotifyOffset = forwardPage * SORTER_PAGE_SIZE;

  document.getElementById('sorter-tracks').innerHTML = '<div class="spinner"></div>';
  document.getElementById('sorter-pagination').innerHTML = '';

  const r = await getAllPlaylistTracks(sorterPlaylistId, SORTER_PAGE_SIZE, spotifyOffset);
  sorterTotal = r.total;
  let tracks = r.items.filter(i => (i.item || i.track) && (i.item || i.track).id).map(i => i.item || i.track);
  if (reverse) tracks = tracks.reverse();

  // Store playlist position on each track for display
  tracks.forEach((t, i) => {
    t._playlistPos = reverse
      ? sorterTotal - forwardPage * SORTER_PAGE_SIZE - i
      : forwardPage * SORTER_PAGE_SIZE + i + 1;
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
    : filtered.map(t => `
    <div class="track-row" id="track-row-${esc(t.id)}">
      <div class="col-num">${t._playlistPos}</div>
      <img class="track-art" src="${t.album && t.album.images && t.album.images[2] ? t.album.images[2].url : ''}" alt="" onerror="this.style.background='var(--bg4)';this.src=''">
      <div class="track-info">
        <div class="track-name">${esc(t.name)}</div>
        <div class="track-artist">${esc(t.artists.map(a=>a.name).join(', '))}</div>
      </div>
      <div style="width:300px;display:flex;flex-wrap:wrap;gap:4px;">${t._genres && t._genres.length ? t._genres.map(g=>`<span class="genre-pill has-genre">${esc(g)}</span>`).join('') : '<span class="genre-pill">—</span>'}</div>
      <div style="width:160px;">
        <button class="add-btn" id="add-${esc(t.id)}" onclick="openAddModal('${esc(t.id)}','${esc(t.name)}')">+ Add to playlist</button>
      </div>
    </div>
  `).join('');
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
    <div class="picker-row" onclick="addTrackToPlaylist('${p.id}','${esc(p.name)}')">
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
      <button class="btn-primary" onclick="removeTrackFromMaster('${esc(trackId)}','${esc(trackName)}')">Yes, remove</button>
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

initApp();
