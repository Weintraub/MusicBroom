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
    const nameEl = document.getElementById('selected-analyzer-playlist-name');
    nameEl.textContent = pl.name;
    nameEl.style.display = '';
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

  // Fetch audio features and merge onto tracks
  try {
    const ids = tracks.map(t => t.id);
    const features = await getAudioFeatures(ids);
    const featMap = {};
    features.forEach(f => { if (f) featMap[f.id] = f; });
    tracks.forEach(t => { t._af = featMap[t.id] || null; });
  } catch (e) {
    // non-fatal — render without audio features
    tracks.forEach(t => { t._af = null; });
  }

  // Stats
  const totalMs = tracks.reduce((s, t) => s + (t.duration_ms || 0), 0);
  const tracksWithBpm = tracks.filter(t => t._af && t._af.tempo > 0);
  const avgBpm = tracksWithBpm.length ? Math.round(tracksWithBpm.reduce((s, t) => s + t._af.tempo, 0) / tracksWithBpm.length) : null;
  const tracksWithEnergy = tracks.filter(t => t._af && t._af.energy != null);
  const avgEnergy = tracksWithEnergy.length ? Math.round(tracksWithEnergy.reduce((s, t) => s + t._af.energy, 0) / tracksWithEnergy.length * 100) : null;
  const tracksWithDance = tracks.filter(t => t._af && t._af.danceability != null);
  const avgDance = tracksWithDance.length ? Math.round(tracksWithDance.reduce((s, t) => s + t._af.danceability, 0) / tracksWithDance.length * 100) : null;

  // Most common key
  const keyCounts = {};
  tracks.forEach(t => { if (t._af && t._af.key >= 0) { const k = keyLabel(t._af.key, t._af.mode); keyCounts[k] = (keyCounts[k] || 0) + 1; } });
  const topKey = Object.keys(keyCounts).sort((a, b) => keyCounts[b] - keyCounts[a])[0] || null;

  document.getElementById('analyzer-stats').innerHTML = `
    <div class="stat-card"><div class="stat-label">Tracks</div><div class="stat-val">${tracks.length}</div></div>
    <div class="stat-card"><div class="stat-label">Total Duration</div><div class="stat-val">${msToHM(totalMs)}</div></div>
    <div class="stat-card"><div class="stat-label">Avg Track Length</div><div class="stat-val">${msToMin(tracks.length ? totalMs/tracks.length : 0)}</div></div>
    ${avgBpm != null ? `<div class="stat-card"><div class="stat-label">Avg BPM</div><div class="stat-val">${avgBpm}</div></div>` : ''}
    ${avgEnergy != null ? `<div class="stat-card"><div class="stat-label">Avg Energy</div><div class="stat-val">${avgEnergy}%</div></div>` : ''}
    ${avgDance != null ? `<div class="stat-card"><div class="stat-label">Avg Danceability</div><div class="stat-val">${avgDance}%</div></div>` : ''}
    ${topKey ? `<div class="stat-card"><div class="stat-label">Top Key</div><div class="stat-val" style="font-size:22px;">${esc(topKey)}</div></div>` : ''}
  `;

  analyzedPlaylistId = id;
  renderAnalyzerTracks(tracks);
}

function renderAnalyzerTracks(tracks) {
  document.getElementById('analyzer-tracks').innerHTML = tracks.map((t, i) => {
    const af = t._af;
    const bpm = af && af.tempo > 0 ? Math.round(af.tempo) : null;
    const key = af ? keyLabel(af.key, af.mode) : null;
    const energy = af && af.energy != null ? Math.round(af.energy * 100) : null;
    const dance = af && af.danceability != null ? Math.round(af.danceability * 100) : null;
    const valence = af && af.valence != null ? Math.round(af.valence * 100) : null;
    const pop = t.popularity != null ? t.popularity : null;
    return `
    <div class="track-row">
      <div class="col-num">${i+1}</div>
      <img class="track-art" src="${t.album && t.album.images && t.album.images[2] ? t.album.images[2].url : ''}" alt="" onerror="this.style.background='var(--bg4)';this.src=''">
      <div class="track-info">
        <div class="track-name">${esc(t.name)}</div>
        <div class="track-artist">${esc(t.artists.map(a=>a.name).join(', '))}</div>
      </div>
      <div class="track-audio">
        ${bpm != null ? `<div class="track-audio-bpm">${bpm} <span>BPM</span></div>` : '<div class="track-audio-bpm track-audio-empty">—</div>'}
        ${key ? `<div class="track-audio-key">${esc(key)}</div>` : '<div class="track-audio-key track-audio-empty">—</div>'}
      </div>
      <div class="track-audio track-audio-right">
        ${energy != null ? `<div class="track-audio-stat"><span class="track-audio-label">NRG</span> ${energy}%</div>` : ''}
        ${dance != null ? `<div class="track-audio-stat"><span class="track-audio-label">DNC</span> ${dance}%</div>` : ''}
        ${valence != null ? `<div class="track-audio-stat"><span class="track-audio-label">VAL</span> ${valence}%</div>` : ''}
        ${pop != null ? `<div class="track-audio-stat"><span class="track-audio-label">POP</span> ${pop}</div>` : ''}
      </div>
      <div class="col-dur">${msToMin(t.duration_ms)}</div>
    </div>`;
  }).join('');
}

initApp();
