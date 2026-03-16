let analyzedPlaylistId = null;

function renderAnalyzerPlaylists() {
  const el = document.getElementById('analyzer-playlists');
  const list = getFilteredSortedPlaylists();
  el.innerHTML = list.length === 0
    ? '<div class="empty-msg">No playlists found.</div>'
    : list.map(p => `
    <div class="playlist-card${p.id === analyzedPlaylistId ? ' selected' : ''}" id="ap-${p.id}" onclick="analyzePlaylist('${p.id}')">
      <img class="playlist-img" src="${p.images && p.images[0] ? p.images[0].url : ''}" alt="" onerror="this.style.background='var(--bg4)';this.src=''">
      <div class="playlist-name">${esc(p.name)}</div>
      <div class="playlist-meta">${(p.tracks || p.items || {}).total} tracks</div>
    </div>
  `).join('');
}

function openAnalyzerPlaylistModal() {
  renderAnalyzerPlaylists();
  document.getElementById('analyzer-playlist-modal').classList.add('open');
}

function closeAnalyzerPlaylistModal() {
  document.getElementById('analyzer-playlist-modal').classList.remove('open');
}

async function analyzePlaylist(id) {
  closeAnalyzerPlaylistModal();
  const pl = allPlaylists.find(p => p.id === id);
  if (pl) {
    document.getElementById('choose-analyzer-playlist-btn').textContent = 'Change playlist';
    document.getElementById('selected-analyzer-playlist-name').textContent = pl.name;
  }

  const res = document.getElementById('analyzer-result');
  res.style.display = '';
  document.getElementById('analyzer-tracks').innerHTML = '<div class="spinner"></div>';
  document.getElementById('analyzer-stats').innerHTML = '';

  // Fetch tracks (up to 200 for speed)
  let tracks = [];
  let offset = 0;
  try {
    while (tracks.length < 200) {
      const r = await getAllPlaylistTracks(id, 100, offset);
      const valid = (r.items || []).filter(i => i.item && i.item.id).map(i => i.item);
      tracks = tracks.concat(valid);
      if (!r.next || valid.length < 100) break;
      offset += 100;
    }
  } catch (e) {
    document.getElementById('analyzer-tracks').innerHTML = `<div class="empty-msg">Failed to load tracks: ${esc(e.message)}${e.status === 403 ? ' — try re-authenticating.' : ''}</div>`;
    analyzedPlaylistId = null;
    return;
  }

  // Stats
  const totalMs = tracks.reduce((s, t) => s + (t.duration_ms || 0), 0);
  document.getElementById('analyzer-stats').innerHTML = `
    <div class="stat-card"><div class="stat-label">Tracks</div><div class="stat-val">${tracks.length}</div></div>
    <div class="stat-card"><div class="stat-label">Total Duration</div><div class="stat-val">${msToHM(totalMs)}</div></div>
    <div class="stat-card"><div class="stat-label">Avg Track Length</div><div class="stat-val">${msToMin(tracks.length ? totalMs/tracks.length : 0)}</div></div>
  `;

  analyzedPlaylistId = id;
  renderAnalyzerTracks(tracks);
}

function renderAnalyzerTracks(tracks) {
  document.getElementById('analyzer-tracks').innerHTML = tracks.map((t, i) => `
    <div class="track-row">
      <div class="col-num">${i+1}</div>
      <img class="track-art" src="${t.album && t.album.images && t.album.images[2] ? t.album.images[2].url : ''}" alt="" onerror="this.style.background='var(--bg4)';this.src=''">
      <div class="track-info">
        <div class="track-name">${esc(t.name)}</div>
        <div class="track-artist">${esc(t.artists.map(a=>a.name).join(', '))}</div>
      </div>
      <div class="col-dur">${msToMin(t.duration_ms)}</div>
    </div>
  `).join('');
}

initApp();
