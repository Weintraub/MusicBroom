let sorterTracks = [];
let sorterOffset = 0;
let sorterTotal = 0;
let sorterPlaylistId = null;
let pendingAddTrack = null;

function renderSorterPlaylists() {
  const el = document.getElementById('sorter-playlists');
  const list = getFilteredSortedPlaylists();
  el.innerHTML = list.length === 0
    ? '<div class="empty-msg">No playlists found.</div>'
    : list.map(p => `
    <div class="playlist-card" id="sp-${p.id}" onclick="selectMasterPlaylist('${p.id}')">
      <img class="playlist-img" src="${p.images && p.images[0] ? p.images[0].url : ''}" alt="" onerror="this.style.background='var(--bg4)';this.src=''">
      <div class="playlist-name">${esc(p.name)}</div>
      <div class="playlist-meta">${(p.tracks || p.items || {}).total} tracks</div>
    </div>
  `).join('');
}

async function selectMasterPlaylist(id) {
  document.querySelectorAll('#sorter-playlists .playlist-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('sp-' + id).classList.add('selected');
  sorterPlaylistId = id;
  sorterTracks = [];
  sorterOffset = 0;
  document.getElementById('sorter-tracks-wrap').style.display = '';
  document.getElementById('sorter-tracks').innerHTML = '<div class="spinner"></div>';
  document.getElementById('load-more-btn').style.display = 'none';
  await loadSorterBatch();
}

async function loadSorterBatch() {
  const r = await getAllPlaylistTracks(sorterPlaylistId, 50, sorterOffset);
  sorterTotal = r.total;
  const newTracks = r.items.filter(i => i.track && i.track.id).map(i => i.track);
  sorterTracks = sorterTracks.concat(newTracks);
  sorterOffset += newTracks.length;

  // Fetch genres for new tracks
  for (let i = 0; i < newTracks.length; i += 5) {
    await Promise.all(newTracks.slice(i, i+5).map(async t => {
      t._genre = await getGenreForTrack(t);
    }));
    renderSorterTracks();
  }

  // Genre filter options
  const genres = [...new Set(sorterTracks.map(t=>t._genre).filter(Boolean))].sort();
  const sel = document.getElementById('sorter-genre-filter');
  const cur = sel.value;
  sel.innerHTML = '<option value="">All genres</option>' + genres.map(g=>`<option value="${esc(g)}" ${g===cur?'selected':''}>${esc(g)}</option>`).join('');

  document.getElementById('load-more-btn').style.display = sorterOffset < sorterTotal ? '' : 'none';
}

async function loadMoreSorterTracks() {
  document.getElementById('load-more-btn').textContent = 'Loading...';
  await loadSorterBatch();
  document.getElementById('load-more-btn').textContent = 'Load more tracks';
}

function renderSorterTracks() {
  const search = (document.getElementById('sorter-search').value || '').toLowerCase();
  const genreFilter = document.getElementById('sorter-genre-filter').value;
  const filtered = sorterTracks.filter(t => {
    if (search && !t.name.toLowerCase().includes(search) && !t.artists.map(a=>a.name.toLowerCase()).join(' ').includes(search)) return false;
    if (genreFilter && t._genre !== genreFilter) return false;
    return true;
  });
  document.getElementById('sorter-tracks').innerHTML = filtered.map((t, i) => `
    <div class="track-row">
      <div class="col-num">${i+1}</div>
      <img class="track-art" src="${t.album && t.album.images && t.album.images[2] ? t.album.images[2].url : ''}" alt="" onerror="this.style.background='var(--bg4)';this.src=''">
      <div class="track-info">
        <div class="track-name">${esc(t.name)}</div>
        <div class="track-artist">${esc(t.artists.map(a=>a.name).join(', '))}</div>
      </div>
      <div style="width:130px;"><span class="genre-pill ${t._genre ? 'has-genre' : ''}">${t._genre ? esc(t._genre) : '—'}</span></div>
      <div style="width:160px;">
        <button class="add-btn" id="add-${esc(t.id)}" onclick="openAddModal('${esc(t.id)}','${esc(t.name)}')">+ Add to playlist</button>
      </div>
    </div>
  `).join('');
}

function filterSorterTracks() { renderSorterTracks(); }

// ── MODAL ──
function openAddModal(trackId, trackName) {
  pendingAddTrack = trackId;
  document.getElementById('modal-title').textContent = 'Add to playlist';
  document.getElementById('modal-sub').textContent = `"${trackName}" → choose a destination`;
  const picker = document.getElementById('modal-picker');
  const dest = allPlaylists.filter(p => p.id !== sorterPlaylistId);
  picker.innerHTML = dest.map(p => `
    <div class="picker-row" onclick="addTrackToPlaylist('${p.id}','${esc(p.name)}')">
      <img class="picker-img" src="${p.images && p.images[0] ? p.images[0].url : ''}" alt="" onerror="this.style.background='var(--bg4)';this.src=''">
      <div>
        <div class="picker-name">${esc(p.name)}</div>
        <div class="picker-meta">${(p.tracks || p.items || {}).total} tracks</div>
      </div>
    </div>
  `).join('');
  document.getElementById('modal').classList.add('open');
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
  pendingAddTrack = null;
}

async function addTrackToPlaylist(playlistId, playlistName) {
  closeModal();
  if (!pendingAddTrack) return;
  const trackUri = `spotify:track:${pendingAddTrack}`;
  const r = await api(`/playlists/${playlistId}/tracks`, 'POST', { uris: [trackUri] });
  if (r && r.snapshot_id) {
    showToast(`Added to "${playlistName}"`, 'ok');
    const btn = document.getElementById('add-' + pendingAddTrack);
    if (btn) { btn.textContent = '✓ Added'; btn.classList.add('done'); btn.disabled = true; }
    const pl = allPlaylists.find(p=>p.id===playlistId);
    if (pl) { const t = pl.tracks || pl.items; if (t) t.total++; }
  } else {
    showToast('Error adding track', 'err');
  }
}

initApp();
