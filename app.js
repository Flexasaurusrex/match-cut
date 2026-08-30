/* ==========================================================================
   The archive engine. Everything a tool can do, a person can also do here.
   ========================================================================== */

const App = (() => {
  const S = {
    index: [], byId: new Map(), byKey: new Map(),
    detail: new Map(), shards: new Map(),
    yt: null, ready: false, current: null,
    queue: [], qi: 0, setTitle: '',
    calls: [], pct: {}, seq: 0, extra: null, deep: false,
    dead: new Set(), lastSkip: 0, skips: 0, skipTimer: null, pool: [],
    hist: [], hi: -1, navigating: false,
    keep: [],          // what the person has told the agent they like
  };

  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const key = (a, t) => norm(a) + '|' + norm(t);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  /* ------------------------------------------------------------- boot --- */
  async function boot() {
    // Boot on the small columnar core so the archive is usable immediately,
    // then stream the heavy fields in behind it. 339K to interactive instead
    // of 2.6MB.
    const t0 = performance.now();
    const core = await fetch('data/core.json').then(r => r.json());
    const D = core.dict;
    for (let i = 0; i < core.n; i++) {
      const c = {
        id: core.id[i], a: core.a[i], t: core.t[i], y: core.y[i],
        d: D.d[core.di[i]] || '', nt: D.nt[core.nti[i]] || '',
        ve: D.ve[core.vei[i]] || '', dc: D.dc[core.dci[i]] || '',
        tier: core.tier[i], dur: core.dur[i],
        still: (core.still && core.still[i]) ? 1 : 0,
        vid: (core.vid && core.vid[i]) || '',
        fp: { motion: core.fp[i][0], bright: core.fp[i][1], warm: core.fp[i][2],
              sat: core.fp[i][3], contrast: core.fp[i][4], shotlen: core.fp[i][5],
              cuts: core.fp[i][6], scenes: core.fp[i][7] },
        tags: [], tech: [], subs: [], conns: [],
      };
      S.index.push(c);
      S.byId.set(c.id, c);
      S.byKey.set(key(c.a, c.t), c);
    }
    for (const f of ['motion', 'bright', 'warm', 'sat', 'contrast', 'shotlen']) {
      const v = S.index.map(c => c.fp[f]).filter(x => x > 0).sort((a, b) => a - b);
      S.pct[f] = { p33: v[Math.floor(v.length * 0.33)], p67: v[Math.floor(v.length * 0.67)] };
    }
    UI.onCorpusReady(S.index.length, Math.round(performance.now() - t0));

    // The rest arrives behind the first paint.
    S.extra = fetch('data/extra.json').then(r => r.json()).then(x => {
      for (let i = 0; i < S.index.length; i++) {
        const c = S.index[i];
        c.tags = x.tags[i] || []; c.tech = x.tech[i] || [];
        c.subs = x.subs[i] || []; c.conns = x.conns[i] || [];
      }
      S.deep = true;
      UI.deepReady();
      if (S.current) UI.paintEdges(connections({ id: S.current.id }));
      return true;
    }).catch(() => false);

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

  // Rank, then pick from the strong band rather than always the single head.
  // Deterministic ranking made an archive of 7,139 feel like an archive of one:
  // "slow, warm, barely cut" matched 480 videos and played the same one forever.
  function sample(ranked, lim) {
    const band = ranked.slice(0, Math.max(lim * 4, 24));
    for (let i = band.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [band[i], band[j]] = [band[j], band[i]];
    }
    return band.slice(0, lim);
  }

  /* ----------------------------------------------------------- search --- */
  function search(a = {}) {
    const lim = clamp(a.limit || 12, 1, 50);
    const q = norm(a.query);
    const terms = q ? q.split(' ').filter(Boolean) : [];
    let out = [];
    for (const c of S.index) {
      if (c.still) continue;   // album art with audio over it, never a pick
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
    out = out.filter(x => !S.dead.has(x.c.id));
    S.pool = out.slice(0, 60).map(x => x.c.id);
    // An exact-looking lookup (one artist, one title) should not be shuffled.
    const narrow = out.length <= lim;
    const picked = narrow ? out.slice(0, lim) : sample(out, lim);
    return { total: out.length, results: picked.map(x => brief(x.c)) };
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
      if (c.still) continue;   // no motion to match on, so it can never look like anything
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
    out = out.filter(x => !S.dead.has(x.c.id));
    S.pool = out.slice(0, 60).map(x => x.c.id);
    // With a seed, stay close on look but vary which of the near matches you get.
    const picked = out.length <= lim ? out : sample(out, lim);
    return {
      matched_on: seed ? `look of "${seed.a} - ${seed.t}"` : Object.keys(want).join(', ') || 'any',
      total: out.length,
      results: picked.map(x => Object.assign(brief(x.c), { look: lookOf(x.c) })),
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
    if (!S.deep) return { from: { id: c.id, artist: c.a, title: c.t }, connections: [],
                          note: 'The connection graph is still loading. Ask again in a moment.' };
    const edges = (c.conns || []).map(k => {
      let hit = S.byKey.get(key(k.a, k.v));
      if (hit && hit.still) hit = null;   // present in the archive, but nothing moves in it
      return { reason: k.r, kind: k.t, artist: k.a, title: k.v, id: hit ? hit.id : null, in_archive: !!hit };
    });
    return {
      from: { id: c.id, artist: c.a, title: c.t },
      note: 'Each edge states the reason it exists rather than a similarity score.',
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
    if (S.dead.has(c.id)) {
      const alt = pickAlternative();
      if (alt) return play({ id: alt.id, note: a.note || '' });
      return { error: 'that video is blocked from embedding and no alternative was found' };
    }
    S.current = c;
    if (window.UI && UI.deadScreen) UI.deadScreen(false);
    if (!S.navigating) {
      // Drop anything ahead of us, the way a browser does after you go back
      // and then somewhere new.
      S.hist = S.hist.slice(0, S.hi + 1);
      if (S.hist[S.hist.length - 1] !== c.id) S.hist.push(c.id);
      S.hi = S.hist.length - 1;
      if (S.hist.length > 200) { S.hist.shift(); S.hi--; }
    }
    UI.transport(S.hi > 0, true);
    const token = ++S.seq;            // annotation fetches are async and can land late
    try { UI.paint(c, a.note || ''); }
    catch (e) { console.error('render failed', e); }
    const go = () => S.yt && S.yt.loadVideoById({ videoId: c.vid || c.id, startSeconds: 0 });
    if (S.ready) go();
    else { let n = 0; const t = setInterval(() => { if (S.ready) { clearInterval(t); go(); } else if (++n > 60) clearInterval(t); }, 200); }
    if (S.queue.length) {
      const i = S.queue.indexOf(c.id);
      if (i >= 0) { S.qi = i; UI.setPosition(i, S.queue.length); }
    }
    // Continuous play should not go quiet because you touched the controls.
    if (window.Radio && Radio.on) Radio.moved(c);
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
    const ids = (a.ids || []).filter(id => S.byId.has(id) && !S.dead.has(id));
    if (!ids.length) return { error: 'none of those ids are in the archive' };
    S.queue = ids; S.qi = 0; S.setTitle = a.title || 'Untitled set';
    const cards = ids.map(id => S.byId.get(id));
    UI.paintQueue(cards, S.setTitle, a.note || '');
    play({ id: ids[0], note: a.note || '' });
    announceNext();
    return {
      queued: ids.length, title: S.setTitle,
      running_order: cards.map(c => `${c.a} - ${c.t}`),
      first: brief(cards[0]),
    };
  }

  // Say what is on deck, the same way continuous play does.
  // Name what just started AND what follows. Announcing only the next one, at
  // the moment a new video appears, reads as though the wrong thing played.
  function announceNext() {
    if (!window.Chat || !Chat.note || !S.queue.length) return;
    const cur = S.byId.get(S.queue[S.qi]);
    const nxt = S.queue[S.qi + 1] ? S.byId.get(S.queue[S.qi + 1]) : null;
    const pos = `${S.qi + 1} of ${S.queue.length}`;
    if (!cur) return;
    Chat.note(nxt
      ? `${S.setTitle} \u00b7 ${pos}. Now: ${cur.a} \u2014 ${cur.t}. Then: ${nxt.a} \u2014 ${nxt.t}.`
      : `${S.setTitle} \u00b7 ${pos}. Now: ${cur.a} \u2014 ${cur.t}. Last in the set.`);
  }

  // Back and forward move through what you have actually watched.
  function back() {
    if (S.hi <= 0) return;
    S.navigating = true;
    S.hi -= 1;
    play({ id: S.hist[S.hi] });
    S.navigating = false;
    UI.transport(S.hi > 0, true);
  }

  function forward() {
    if (S.hi >= S.hist.length - 1) return false;
    S.navigating = true;
    S.hi += 1;
    play({ id: S.hist[S.hi] });
    S.navigating = false;
    UI.transport(S.hi > 0, true);
    return true;
  }

  function jumpTo(id) {
    const i = S.queue.indexOf(id);
    if (i >= 0) { S.qi = i; play({ id: S.queue[i] }); announceNext(); return; }
    play({ id });
  }
  // Advance inside a set. Returns false at the end rather than wrapping, which
  // is what made a six video set play the same six forever.
  function advanceInSet() {
    if (!S.queue.length || S.qi >= S.queue.length - 1) return false;
    S.qi += 1;
    play({ id: S.queue[S.qi] });
    announceNext();
    return true;
  }

  function endOfSet() {
    const title = S.setTitle || 'The set';
    S.queue = []; S.qi = 0; S.setTitle = '';
    UI.paintSet([], '', 0);
    return title;
  }

  // The transport button. At the end of a set it leaves the set rather than
  // looping, so pressing next always moves somewhere new.
  function next() {
    if (forward()) return;
    if (advanceInSet()) return;
    if (S.queue.length) endOfSet();
    const cur = S.current;
    if (cur) {
      const c = connections({ id: cur.id });
      const live = (c.connections || []).filter(e => e.in_archive && !S.dead.has(e.id));
      if (live.length) {
        const e = live[Math.floor(Math.random() * Math.min(5, live.length))];
        return play({ id: e.id, note: e.reason });
      }
      const near = findByLook({ like_id: cur.id, limit: 8 });
      const pick = (near.results || []).find(r => !S.dead.has(r.id));
      if (pick) return play({ id: pick.id, note: 'Nearest on look.' });
    }
    const any = search({ tier: 1, limit: 8 });
    if (any.results && any.results.length) play({ id: any.results[0].id });
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

  /* ---------------------------------------------------------- records --- */
  // Real pressings with real prices. Nothing is invented and nothing is sold
  // here: the buy link goes to the actual Discogs listing.
  async function findRecords(a = {}) {
    const cur = S.current;
    const artist = a.artist || (cur && cur.a);
    if (!artist) return { error: 'nothing playing and no artist given' };
    const q = new URLSearchParams({ artist });
    if (a.title) q.set('title', a.title);
    if (a.format) q.set('format', a.format);
    try {
      const r = await fetch(`/api/records?${q}`).then(x => x.json());
      if (r.releases && r.releases.length) UI.paintRecords(artist, r.releases);
      return r;
    } catch (e) {
      return { error: 'could not reach the marketplace', releases: [] };
    }
  }

  /* ------------------------------------------------------------- taste --- */
  // The only state that persists. Written by the agent or by hand, read back by
  // the agent, and kept in the browser rather than on a server, which is the case
  // WebMCP exists for.
  const KEEP = 'matchcut.keep';

  function loadKeep() {
    try { S.keep = JSON.parse(localStorage.getItem(KEEP) || '[]'); }
    catch (e) { S.keep = []; }
    UI.paintKeep(S.keep.map(k => S.byId.get(k.id)).filter(Boolean), S.keep);
  }
  function saveKeep() {
    try { localStorage.setItem(KEEP, JSON.stringify(S.keep)); } catch (e) {}
    UI.paintKeep(S.keep.map(k => S.byId.get(k.id)).filter(Boolean), S.keep);
  }

  function keepIt(a = {}) {
    const id = a.id || (S.current && S.current.id);
    const c = S.byId.get(id);
    if (!c) return { error: 'nothing playing and no id given' };
    if (S.keep.some(k => k.id === id)) return { already_kept: brief(c), kept: S.keep.length };
    S.keep.unshift({ id, why: (a.why || '').slice(0, 160), at: Date.now() });
    saveKeep();
    return { kept: brief(c), why: a.why || null, total: S.keep.length };
  }

  function dropIt(a = {}) {
    const id = a.id || (S.current && S.current.id);
    const before = S.keep.length;
    S.keep = S.keep.filter(k => k.id !== id);
    saveKeep();
    return { removed: before - S.keep.length, total: S.keep.length };
  }

  function myTaste() {
    if (!S.keep.length) {
      return { kept: 0, note: 'Nothing kept yet. Ask to keep something and it will be here next time.' };
    }
    const cards = S.keep.map(k => Object.assign({}, S.byId.get(k.id) ? brief(S.byId.get(k.id)) : { id: k.id }, { why: k.why || null }));
    const live = S.keep.map(k => S.byId.get(k.id)).filter(Boolean);
    const avg = (f) => live.length ? +(live.reduce((n, c) => n + c.fp[f], 0) / live.length).toFixed(2) : null;
    const count = (f) => {
      const t = {}; for (const c of live) if (c[f]) t[c[f]] = (t[c[f]] || 0) + 1;
      return Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} (${n})`);
    };
    return {
      kept: S.keep.length,
      videos: cards,
      // the shape of what they like, so the agent can act on it rather than guess
      average_look: { motion: avg('motion'), brightness: avg('bright'), warmth: avg('warm'),
                      saturation: avg('sat'), contrast: avg('contrast'), shot_seconds: avg('shotlen') },
      leans_toward: { narrative_type: count('nt'), visual_era: count('ve'), director: count('d') },
    };
  }

  // Find something new that matches the shape of what they have kept.
  function fromTaste(a = {}) {
    const live = S.keep.map(k => S.byId.get(k.id)).filter(Boolean);
    if (!live.length) return { error: 'nothing kept yet, so there is no taste to work from' };
    const avg = {};
    for (const f of ['motion', 'bright', 'warm', 'sat', 'contrast', 'shotlen']) {
      avg[f] = live.reduce((n, c) => n + c.fp[f], 0) / live.length;
    }
    const keptIds = new Set(S.keep.map(k => k.id));
    const lim = clamp(a.limit || 8, 1, 30);
    const scored = [];
    for (const c of S.index) {
      if (c.still || keptIds.has(c.id) || S.dead.has(c.id)) continue;
      let d = 0;
      for (const f in avg) {
        const hi = S.pct[f] ? (S.pct[f].p67 || 1) : 1;
        d += Math.pow((c.fp[f] - avg[f]) / hi, 2);
      }
      scored.push({ c, d: Math.sqrt(d) });
    }
    scored.sort((x, y) => x.d - y.d);
    return {
      based_on: `${live.length} kept video${live.length > 1 ? 's' : ''}`,
      results: sample(scored, lim).map(x => Object.assign(brief(x.c), { look: lookOf(x.c) })),
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
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING) {
            UI.playState(true);
            UI.deadScreen(false);      // something is on screen again
            S.skips = 0;               // the run of failures is over
          }
          if (e.data === YT.PlayerState.PAUSED) UI.playState(false);
          if (e.data !== YT.PlayerState.ENDED) return;
          if (advanceInSet()) return;                     // still inside a set
          const finished = S.queue.length ? endOfSet() : null;
          UI.playState(false);
          if (window.Radio && Radio.on) {
            if (finished && window.Chat) Chat.note(`${finished} is finished. Carrying on.`);
            Radio.ended();
          } else if (finished && window.Chat) {
            Chat.note(`${finished} is finished. Press Keep it going, or ask for something else.`);
          }
          // Continuous play is off and no set is running, so the screen stays put.
          // next() is the transport button; wiring it in here made a finished video
          // walk a connection and start playing on its own, which is exactly what
          // 'Keep it going' is supposed to be the switch for.
        },
        onError: () => skipDead(),
      },
    });
  }

  // Roughly 2.5% of the archive is embed-blocked by the rights holder. Do not
  // strand the viewer on a dead frame: mark it, say so, and move on. Throttled,
  // because an unguarded error handler that advances will burn the whole queue.
  function skipDead() {
    const cur = S.current;
    if (cur) S.dead.add(cur.id);

    // The old guard returned here on a fast second failure, which left the
    // viewer parked on the rights holder's error card with nothing playing.
    // Now the attempt is always made, just spaced out and bounded.
    if (S.skipTimer) return;
    S.skips = (S.skips || 0) + 1;

    if (S.skips > 12) {
      UI.deadScreen(true, cur, 'Too many blocked in a row. Ask for something else.');
      UI.playerError(cur, null);
      S.skips = 0;
      return;
    }

    UI.deadScreen(true, cur, 'Finding another one');
    const wait = Math.max(0, 900 - (Date.now() - S.lastSkip));
    S.skipTimer = setTimeout(() => {
      S.skipTimer = null;
      S.lastSkip = Date.now();
      const alt = pickAlternative();
      if (!alt) {
        UI.deadScreen(true, cur, 'Nothing nearby is playable. Ask for something else.');
        UI.playerError(cur, null);
        return;
      }
      UI.playerError(cur, alt);
      play({ id: alt.id, note: `${cur ? cur.a : 'That one'} is blocked from embedding. Playing the next match instead.` });
    }, wait);
  }

  function pickAlternative() {
    // prefer whatever the queue or the last result set was already offering
    const from = [...S.queue.slice(S.qi + 1), ...S.pool];
    for (const id of from) {
      if (!S.dead.has(id) && S.byId.has(id)) return S.byId.get(id);
    }
    const cur = S.current;
    if (cur) {
      const near = findByLook({ like_id: cur.id, limit: 40 });
      for (const r of (near.results || [])) if (!S.dead.has(r.id)) return S.byId.get(r.id);
    }
    // Floor. Embed blocking is a property of the rights holder, so the videos
    // that look most like a blocked one are often from the same label and
    // blocked too. Looking only at close neighbours kept picking from inside
    // the same dead cluster until it ran out. Leave the neighbourhood: with
    // thousands playable, running out should be impossible.
    const live = [];
    for (const c of S.index) {
      if (c.still || S.dead.has(c.id)) continue;
      if (cur && c.a === cur.a) continue;        // same artist, likely same blocker
      live.push(c);
    }
    if (live.length) return live[(Math.random() * live.length) | 0];
    return null;
  }

  function logCall(name, args, result, ms) {
    S.calls.unshift({ name, args, result, ms, at: new Date().toLocaleTimeString() });
    S.calls = S.calls.slice(0, 40);
    UI.paintCalls(S.calls);
  }

  return { boot, bootPlayer, search, findByLook, connections, play, nowPlaying,
           skipDead, jumpTo, advanceInSet, back, next,
           annotation, queueSet, stats, logCall,
           keepIt, dropIt, myTaste, fromTaste, loadKeep, findRecords,
           setAgentStatus: (...a) => UI.agentStatus(...a),
           _state: S };
})();

window.App = App;
