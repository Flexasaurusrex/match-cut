/* ==========================================================================
   The archive engine. Everything a tool can do, a person can also do here.
   ========================================================================== */

const App = (() => {
  const S = {
    index: [], byId: new Map(), byKey: new Map(),
    detail: new Map(), shards: new Map(),
    yt: null, ready: false, current: null,
    queue: [], qi: 0, setTitle: '',
    calls: [], pct: {}, seq: 0,
  };

  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const key = (a, t) => norm(a) + '|' + norm(t);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  /* ------------------------------------------------------------- boot --- */
  async function boot() {
    const res = await fetch('data/index.json');
    S.index = await res.json();
    for (const c of S.index) {
      S.byId.set(c.id, c);
      S.byKey.set(key(c.a, c.t), c);
    }
    // percentile cuts so "high motion" means high *for this archive*
    for (const f of ['motion', 'bright', 'warm', 'sat', 'contrast', 'shotlen']) {
      const v = S.index.map(c => c.fp[f]).filter(x => x > 0).sort((a, b) => a - b);
      S.pct[f] = { p33: v[Math.floor(v.length * 0.33)], p67: v[Math.floor(v.length * 0.67)] };
    }
    UI.onCorpusReady(S.index.length);
    return S.index.length;
  }

  // FNV-1a, identical to scripts/build_corpus.py, so the browser knows which
  // shard a card lives in without a lookup table.
  function shardOf(id) {
    let h = 0x811c9dc5;
    for (const b of new TextEncoder().encode(id)) {
      h ^= b;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h % 128;
  }

  async function detailFor(id) {
    if (S.detail.has(id)) return S.detail.get(id);
    const b = String(shardOf(id)).padStart(3, '0');
    if (!S.shards.has(b)) S.shards.set(b, fetch(`data/detail/${b}.json`).then(r => r.json()));
    const obj = await S.shards.get(b);
    for (const k in obj) if (!S.detail.has(k)) S.detail.set(k, obj[k]);
    return S.detail.get(id) || null;
  }

  /* ----------------------------------------------------------- search --- */
  function search(a = {}) {
    const lim = clamp(a.limit || 12, 1, 50);
    const q = norm(a.query);
    const terms = q ? q.split(' ').filter(Boolean) : [];
    let out = [];
    for (const c of S.index) {
      if (a.director && !norm(c.d).includes(norm(a.director))) continue;
      if (a.narrative_type && c.nt !== a.narrative_type) continue;
      if (a.visual_era && c.ve !== a.visual_era) continue;
      if (a.year_from && (!c.y || c.y < a.year_from)) continue;
      if (a.year_to && (!c.y || c.y > a.year_to)) continue;
      if (a.tier != null && Number(c.tier) > Number(a.tier)) continue;
      let score = 0;
      if (terms.length) {
        const hay = norm([c.a, c.t, c.d, (c.tags || []).join(' '), (c.tech || []).join(' '), (c.subs || []).join(' ')].join(' '));
        for (const t of terms) {
          if (!hay.includes(t)) { score = -1; break; }
          if (norm(c.a).includes(t)) score += 3;
          if (norm(c.t).includes(t)) score += 2;
          score += 1;
        }
        if (score < 0) continue;
      }
      score += (4 - Number(c.tier || 3)) * 0.5;
      out.push({ c, score });
    }
    out.sort((x, y) => y.score - x.score || (y.c.y || 0) - (x.c.y || 0));
    return { total: out.length, results: out.slice(0, lim).map(x => brief(x.c)) };
  }

  /* ------------------------------------------------------ visual look --- */
  const band = (v, f) => v <= S.pct[f].p33 ? 'low' : v >= S.pct[f].p67 ? 'high' : 'medium';
  function findByLook(a = {}) {
    const lim = clamp(a.limit || 10, 1, 50);
    const seed = a.like_id ? S.byId.get(a.like_id) : null;
    if (a.like_id && !seed) return { error: `unknown id ${a.like_id}` };
    const want = {};
    const map = { motion: 'motion', brightness: 'bright', warmth: 'warm' };
    for (const k in map) if (a[k]) want[map[k]] = a[k] === 'dark' ? 'low' : a[k] === 'cool' ? 'low'
      : a[k] === 'bright' ? 'high' : a[k] === 'warm' ? 'high' : a[k];
    if (a.pace) want.shotlen = a.pace === 'frantic' ? 'low' : a.pace === 'slow' ? 'high' : 'medium';

    let out = [];
    for (const c of S.index) {
      if (seed && c.id === seed.id) continue;
      if (seed && a.exclude_same_era && c.ve === seed.ve) continue;
      let ok = true;
      for (const f in want) if (band(c.fp[f], f) !== want[f]) { ok = false; break; }
      if (!ok) continue;
      let d = 0;
      if (seed) {
        for (const f of ['motion', 'bright', 'warm', 'sat', 'contrast', 'shotlen']) {
          const hi = S.pct[f].p67 || 1;
          d += Math.pow((c.fp[f] - seed.fp[f]) / (hi || 1), 2);
        }
        d = Math.sqrt(d);
      }
      out.push({ c, d });
    }
    out.sort((x, y) => seed ? x.d - y.d : (Number(x.c.tier) - Number(y.c.tier)));
    return {
      matched_on: seed ? `look of "${seed.a} - ${seed.t}"` : Object.keys(want).join(', ') || 'any',
      total: out.length,
      results: out.slice(0, lim).map(x => Object.assign(brief(x.c), { look: lookOf(x.c) })),
    };
  }
  const lookOf = (c) => ({
    motion: band(c.fp.motion, 'motion'), brightness: band(c.fp.bright, 'bright'),
    warmth: band(c.fp.warm, 'warm'), avg_shot_seconds: c.fp.shotlen, cuts: c.fp.cuts,
  });

  /* ------------------------------------------------------ connections --- */
  function connections(a = {}) {
    const id = a.id || (S.current && S.current.id);
    const c = S.byId.get(id);
    if (!c) return { error: 'nothing playing and no id given' };
    const edges = (c.conns || []).map(k => {
      const hit = S.byKey.get(key(k.a, k.v));
      return { reason: k.r, kind: k.t, artist: k.a, title: k.v, id: hit ? hit.id : null, in_archive: !!hit };
    });
    return {
      from: { id: c.id, artist: c.a, title: c.t },
      note: 'Every edge was authored by hand. The reason is the point.',
      connections: edges,
    };
  }

  /* -------------------------------------------------------- playback --- */
  function brief(c) {
    return { id: c.id, artist: c.a, title: c.t, year: c.y, director: c.d || null,
             narrative_type: c.nt, visual_era: c.ve, tier: c.tier };
  }
  function play(a = {}) {
    const c = S.byId.get(a.id);
    if (!c) return { error: `unknown id ${a.id}` };
    S.current = c;
    const token = ++S.seq;            // annotation fetches are async and can land late
    try { UI.paint(c, a.note || ''); }
    catch (e) { console.error('render failed', e); }
    const go = () => S.yt && S.yt.loadVideoById({ videoId: c.id, startSeconds: 0 });
    if (S.ready) go();
    else { let n = 0; const t = setInterval(() => { if (S.ready) { clearInterval(t); go(); } else if (++n > 60) clearInterval(t); }, 200); }
    detailFor(c.id).then(d => {
      if (token !== S.seq) return;    // something else is on screen now, drop it
      UI.paintDetail(c, d);
    });
    return { playing: brief(c), note: a.note || null };
  }
  function nowPlaying() {
    if (!S.current) return { playing: null, hint: 'Nothing on screen yet. Search, then play something.' };
    let at = null;
    try { at = Math.round(S.yt.getCurrentTime()); } catch (e) {}
    return { playing: brief(S.current), seconds_elapsed: at, duration: S.current.dur,
             set: S.setTitle || null, look: lookOf(S.current) };
  }
  async function annotation(a = {}) {
    const id = a.id || (S.current && S.current.id);
    const c = S.byId.get(id);
    if (!c) return { error: 'nothing playing and no id given' };
    const d = await detailFor(id);
    if (!d) return { error: 'no annotation for that id' };
    return { about: brief(c), cultural_context: d.context, curatorial_assessment: d.curatorial,
             genre_significance: d.sig, era: d.era, movement: d.movement,
             director_biography: d.dbio || null, techniques: c.tech, subcultures: c.subs };
  }
  function queueSet(a = {}) {
    const ids = (a.ids || []).filter(id => S.byId.has(id));
    if (!ids.length) return { error: 'none of those ids are in the archive' };
    S.queue = ids; S.qi = 0; S.setTitle = a.title || 'Untitled set';
    UI.paintQueue(S.queue.map(id => S.byId.get(id)), S.setTitle, a.note || '');
    play({ id: ids[0], note: a.note || '' });
    return { queued: ids.length, title: S.setTitle, first: brief(S.byId.get(ids[0])) };
  }
  function next() {
    if (!S.queue.length) return;
    S.qi = (S.qi + 1) % S.queue.length;
    play({ id: S.queue[S.qi] });
  }
  function stats() {
    const yrs = S.index.map(c => c.y).filter(Boolean);
    const dirs = new Set(S.index.map(c => c.d).filter(Boolean));
    const conns = S.index.reduce((n, c) => n + (c.conns || []).length, 0);
    return {
      videos: S.index.length, years: `${Math.min(...yrs)} to ${Math.max(...yrs)}`,
      directors: dirs.size, hand_authored_connections: conns,
      narrative_types: ['theatrical','realism','documentary','surrealism','experimental'],
      visual_eras: ['vhs-aesthetic','film-70s-80s','early-digital-90s','hd-digital-2000s','4k-modern'],
      every_video_has: 'cultural context, curatorial assessment, and a visual fingerprint (motion, brightness, warmth, saturation, contrast, average shot length)',
      note: 'Annotations are research text, not generated blurbs. Quote them rather than inventing facts.',
    };
  }

  /* ---------------------------------------------------------- youtube --- */
  function bootPlayer() {
    if (S.yt || !(window.YT && window.YT.Player)) return;
    S.yt = new YT.Player('screen', {
      width: '100%', height: '100%', videoId: '',
      playerVars: { autoplay: 0, controls: 1, rel: 0, playsinline: 1, iv_load_policy: 3 },
      events: {
        onReady: () => { S.ready = true; },
        onStateChange: (e) => { if (e.data === YT.PlayerState.ENDED) next(); },
        onError: () => UI.playerError(),
      },
    });
  }

  function logCall(name, args, result, ms) {
    S.calls.unshift({ name, args, result, ms, at: new Date().toLocaleTimeString() });
    S.calls = S.calls.slice(0, 40);
    UI.paintCalls(S.calls);
  }

  return { boot, bootPlayer, search, findByLook, connections, play, nowPlaying,
           annotation, queueSet, stats, next, logCall,
           setAgentStatus: (...a) => UI.agentStatus(...a),
           _state: S };
})();

window.App = App;
