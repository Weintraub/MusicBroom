let analyzedPlaylistId = null;

function renderAnalyzerPlaylists() {
  const el = document.getElementById('analyzer-playlists');
  const list = getFilteredSortedPlaylists();
  el.innerHTML = list.length === 0
    ? '<div class="empty-msg">No playlists found.</div>'
    : list.map(p => `
    <div class="playlist-card" onclick="analyzePlaylist('${p.id}')">
      <img class="playlist-img" src="${p.images && p.images[0] ? p.images[0].url : ''}" alt="" onerror="this.style.background='var(--bg4)';this.src=''">
      <div class="playlist-name">${esc(p.name)}</div>
      <div class="playlist-meta">${(p.tracks || p.items || {}).total} tracks</div>
    </div>
  `).join('');
}

async function analyzePlaylist(id) {
  if (analyzedPlaylistId === id) return;
  analyzedPlaylistId = id;
  document.querySelectorAll('#analyzer-playlists .playlist-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('analyzer-result').style.display = 'none';

  const card = document.querySelector(`#analyzer-playlists .playlist-card[onclick*="${id}"]`);
  if (card) card.classList.add('selected');

  const res = document.getElementById('analyzer-result');
  res.style.display = '';
  document.getElementById('analyzer-tracks').innerHTML = '<div class="spinner"></div>';
  document.getElementById('genre-bars').innerHTML = '';
  document.getElementById('analyzer-stats').innerHTML = '';

  // Fetch tracks (up to 200 for speed)
  let tracks = [];
  let offset = 0;
  while (tracks.length < 200) {
    const r = await getAllPlaylistTracks(id, 100, offset);
    const valid = r.items.filter(i => i.track && i.track.id).map(i => i.track);
    tracks = tracks.concat(valid);
    if (!r.next || valid.length < 100) break;
    offset += 100;
  }

  // Stats
  const totalMs = tracks.reduce((s, t) => s + (t.duration_ms || 0), 0);
  document.getElementById('analyzer-stats').innerHTML = `
    <div class="stat-card"><div class="stat-label">Tracks</div><div class="stat-val">${tracks.length}</div></div>
    <div class="stat-card"><div class="stat-label">Total Duration</div><div class="stat-val">${msToHM(totalMs)}</div></div>
    <div class="stat-card"><div class="stat-label">Avg Track Length</div><div class="stat-val">${msToMin(tracks.length ? totalMs/tracks.length : 0)}</div></div>
  `;

  // Render table first (no genres yet)
  renderAnalyzerTracks(tracks, {});

  // Fetch genres in batches (5 at a time)
  const genreMap = {};
  for (let i = 0; i < tracks.length; i += 5) {
    const batch = tracks.slice(i, i+5);
    await Promise.all(batch.map(async t => {
      const g = await getGenreForTrack(t);
      if (g) {
        genreMap[t.id] = g;
        genreMap['_counts'] = genreMap['_counts'] || {};
        genreMap['_counts'][g] = (genreMap['_counts'][g] || 0) + 1;
      }
    }));
    renderAnalyzerTracks(tracks, genreMap);
    renderGenreBars(genreMap['_counts'] || {}, tracks.length);
  }

  // Update stats with genre count
  const uniqueGenres = Object.keys(genreMap['_counts'] || {}).length;
  document.getElementById('analyzer-stats').innerHTML += `
    <div class="stat-card"><div class="stat-label">Unique Genres</div><div class="stat-val">${uniqueGenres}</div></div>
  `;
}

function renderAnalyzerTracks(tracks, genreMap) {
  document.getElementById('analyzer-tracks').innerHTML = tracks.map((t, i) => `
    <div class="track-row">
      <div class="col-num">${i+1}</div>
      <img class="track-art" src="${t.album && t.album.images && t.album.images[2] ? t.album.images[2].url : ''}" alt="" onerror="this.style.background='var(--bg4)';this.src=''">
      <div class="track-info">
        <div class="track-name">${esc(t.name)}</div>
        <div class="track-artist">${esc(t.artists.map(a=>a.name).join(', '))}</div>
      </div>
      <div style="width:120px;"><span class="genre-pill ${genreMap[t.id] ? 'has-genre' : ''}">${genreMap[t.id] ? esc(genreMap[t.id]) : '—'}</span></div>
      <div class="col-dur">${msToMin(t.duration_ms)}</div>
    </div>
  `).join('');
}

function renderGenreBars(counts, total) {
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,12);
  const max = sorted[0] ? sorted[0][1] : 1;
  document.getElementById('genre-bars').innerHTML = sorted.map(([g,n]) => `
    <div class="genre-bar-row">
      <div class="genre-label">${esc(g)}</div>
      <div class="genre-bar-bg"><div class="genre-bar-fill" style="width:${Math.round(n/max*100)}%"></div></div>
      <div class="genre-pct">${Math.round(n/total*100)}%</div>
    </div>
  `).join('');
}

initApp();
