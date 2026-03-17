let sorterTracks = [];
let sorterOffset = 0;
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
  }
  sorterTracks = [];
  sorterOffset = 0;
  sorterPage = 0;
  document.getElementById('sorter-tracks-wrap').style.display = '';
  document.getElementById('sorter-tracks').innerHTML = '<div class="spinner"></div>';
  document.getElementById('sorter-pagination').innerHTML = '';
  await loadSorterBatch();
}

async function loadSorterBatch() {
  const r = await getAllPlaylistTracks(sorterPlaylistId, 50, sorterOffset);
  sorterTotal = r.total;
  const newTracks = r.items.filter(i => (i.item || i.track) && (i.item || i.track).id).map(i => i.item || i.track);
  sorterTracks = sorterTracks.concat(newTracks);
  sorterOffset += newTracks.length;

  // Fetch genres for new tracks
  for (let i = 0; i < newTracks.length; i += 5) {
    await Promise.all(newTracks.slice(i, i+5).map(async t => {
      t._genres = await getGenreForTrack(t);
    }));
    renderSorterTracks();
  }

  // Genre filter options
  const genres = [...new Set(sorterTracks.flatMap(t=>t._genres||[]))].sort();
  const sel = document.getElementById('sorter-genre-filter');
  const cur = sel.value;
  sel.innerHTML = '<option value="">All genres</option>' + genres.map(g=>`<option value="${esc(g)}" ${g===cur?'selected':''}>${esc(g)}</option>`).join('');

}

function getFilteredSorterTracks() {
  const search = (document.getElementById('sorter-search').value || '').toLowerCase();
  const genreFilter = document.getElementById('sorter-genre-filter').value;
  return sorterTracks.filter(t => {
    if (search && !t.name.toLowerCase().includes(search) && !t.artists.map(a=>a.name.toLowerCase()).join(' ').includes(search)) return false;
    if (genreFilter && !(t._genres||[]).includes(genreFilter)) return false;
    return true;
  });
}

function renderSorterTracks() {
  const filtered = getFilteredSorterTracks();
  const totalPages = Math.max(1, Math.ceil(filtered.length / SORTER_PAGE_SIZE));
  if (sorterPage >= totalPages) sorterPage = totalPages - 1;
  const start = sorterPage * SORTER_PAGE_SIZE;
  const pageItems = filtered.slice(start, start + SORTER_PAGE_SIZE);
  document.getElementById('sorter-tracks').innerHTML = pageItems.map((t, i) => `
    <div class="track-row">
      <div class="col-num">${start + i + 1}</div>
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
  renderSorterPagination(filtered.length, totalPages);
}

function renderSorterPagination(filteredCount, totalPages) {
  const el = document.getElementById('sorter-pagination');
  if (!el) return;
  if (filteredCount === 0) { el.innerHTML = ''; return; }
  const hasPrev = sorterPage > 0;
  const hasNext = sorterPage < totalPages - 1 || sorterOffset < sorterTotal;
  const isFiltered = document.getElementById('sorter-search').value || document.getElementById('sorter-genre-filter').value;
  const knownTotalPages = !isFiltered ? Math.ceil(sorterTotal / SORTER_PAGE_SIZE) : totalPages;
  const uncertain = isFiltered && sorterOffset < sorterTotal;
  const pageLabel = `Page ${sorterPage + 1} of ${knownTotalPages}${uncertain ? '+' : ''}`;
  el.innerHTML = `
    <button class="btn-ghost" onclick="prevSorterPage()" ${hasPrev ? '' : 'disabled'}>← Prev</button>
    <span class="pagination-label">${pageLabel}</span>
    <button class="btn-ghost" onclick="nextSorterPage()" ${hasNext ? '' : 'disabled'}>Next →</button>
  `;
}

async function nextSorterPage() {
  const filtered = getFilteredSorterTracks();
  const totalPages = Math.ceil(filtered.length / SORTER_PAGE_SIZE);
  if (sorterPage < totalPages - 1) {
    sorterPage++;
    renderSorterTracks();
    window.scrollTo(0, 0);
  } else if (sorterOffset < sorterTotal) {
    document.getElementById('sorter-pagination').innerHTML = '<div class="spinner" style="margin:auto;"></div>';
    await loadSorterBatch();
    const newFiltered = getFilteredSorterTracks();
    const newTotalPages = Math.ceil(newFiltered.length / SORTER_PAGE_SIZE);
    if (sorterPage < newTotalPages - 1) sorterPage++;
    renderSorterTracks();
    window.scrollTo(0, 0);
  }
}

function prevSorterPage() {
  if (sorterPage > 0) {
    sorterPage--;
    renderSorterTracks();
    window.scrollTo(0, 0);
  }
}

function filterSorterTracks() { sorterPage = 0; renderSorterTracks(); }

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
    } else {
      showToast('Error adding track', 'err');
    }
  } catch (e) {
    showToast(e.message || 'Error adding track', 'err');
  }
}

initApp();
