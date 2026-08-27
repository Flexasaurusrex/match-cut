/* ==========================================================================
   Boot. The YouTube API tag sits above these scripts, so its ready callback
   can fire before this file runs and be lost, leaving a black stage. Boot is
   idempotent and called from every direction.
   ========================================================================== */

window.onYouTubeIframeAPIReady = () => App.bootPlayer();
App.bootPlayer();
if (window.YT && window.YT.ready) window.YT.ready(() => App.bootPlayer());
(function waitForApi(){
  let n = 0;
  const t = setInterval(() => {
    if (App._state.yt) return clearInterval(t);
    App.bootPlayer();
    if (++n > 60) clearInterval(t);
  }, 200);
})();

/* --------------------------------------------------------------------------
   Demo runner. The starter lines call the same tools an agent would, so the
   page demonstrates itself in a browser that has no agent attached.
   -------------------------------------------------------------------------- */
const Demo = (() => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  async function call(name, args) {
    const t = TOOLS.find(x => x.name === name);
    const started = performance.now();
    const res = await t.run(args || {});
    App.logCall(name, args || {}, res, Math.round(performance.now() - started));
    await wait(520);
    return res;
  }

  const SCRIPTS = [
    // Play something by Michel Gondry and tell me why it matters
    async () => {
      const r = await call('search_archive', { director: 'Michel Gondry', tier: 1, limit: 6 });
      if (!r.results?.length) return call('search_archive', { query: 'gondry', limit: 6 });
      const pick = r.results[0];
      await call('play', { id: pick.id, note: `Gondry, ${pick.year}. Reaching for the annotation.` });
      await call('get_annotation', { id: pick.id });
    },
    // Find a video that looks like this one but from a different era
    async () => {
      let cur = App.nowPlaying().playing;
      if (!cur) {
        const s = await call('search_archive', { tier: 1, limit: 8 });
        cur = s.results[Math.floor(Math.random() * s.results.length)];
        await call('play', { id: cur.id, note: 'Starting point for the look match.' });
      }
      const r = await call('find_by_look', { like_id: cur.id, exclude_same_era: true, limit: 6 });
      if (r.results?.length) {
        const m = r.results[0];
        await call('play', { id: m.id, note: `Same visual grammar as ${cur.artist}, different era: ${m.visual_era}.` });
      }
    },
    // Something slow, warm and barely cut
    async () => {
      const r = await call('find_by_look', { pace: 'slow', warmth: 'warm', motion: 'low', limit: 8 });
      if (r.results?.length) {
        await call('play', { id: r.results[0].id, note: 'Slow, warm, and cut as little as possible.' });
        await call('get_annotation', {});
      }
    },
    // Walk me three connections out from here
    async () => {
      let cur = App.nowPlaying().playing;
      if (!cur) {
        const s = await call('search_archive', { tier: 1, limit: 10 });
        cur = s.results[Math.floor(Math.random() * s.results.length)];
        await call('play', { id: cur.id, note: 'Starting point.' });
      }
      for (let i = 0; i < 3; i++) {
        const r = await call('follow_connection', {});
        const live = (r.connections || []).filter(e => e.in_archive);
        if (!live.length) break;
        const e = live[Math.floor(Math.random() * Math.min(4, live.length))];
        await call('play', { id: e.id, note: e.reason });
      }
    },
    // Build a set about surrealism in the 90s
    async () => {
      const r = await call('search_archive', { narrative_type: 'surrealism', year_from: 1990, year_to: 1999, limit: 6 });
      if (r.results?.length) {
        await call('queue_set', {
          title: 'Surrealism, 1990s',
          ids: r.results.map(x => x.id),
          note: 'Six videos that answer the same question differently.',
        });
      }
    },
  ];

  let busy = false;
  async function run(i) {
    if (busy) return;
    busy = true;
    // Only claim an agent if one actually registered the tools.
    if (!document.modelContext) UI.agentStatus('local');
    try { await SCRIPTS[i](); } finally { busy = false; }
  }
  return { run, call };
})();
window.Demo = Demo;

/* ------------------------------------------------------------------ go --- */
(async () => {
  await App.boot();
  Chat.init();
  Radio.init();

  // Phone tabs. Below 1100px the conversation used to be hidden entirely, which
  // removed the whole point of the page.
  const tabs = document.getElementById('tabs');
  const setTab = (t) => {
    document.body.dataset.tab = t;
    [...tabs.querySelectorAll('button')].forEach(b =>
      b.setAttribute('aria-pressed', b.dataset.tab === t ? 'true' : 'false'));
    if (t === 'talk') document.getElementById('tabDot').classList.remove('on');
  };
  setTab('watch');
  tabs.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    setTab(b.dataset.tab);
  };
  // Mark the conversation tab when the agent says something you cannot see.
  window.notifyTalk = () => {
    if (document.body.dataset.tab !== 'talk' && window.innerWidth <= 1100) {
      document.getElementById('tabDot').classList.add('on');
    }
  };

  // Transport. Back walks what you have watched; next replays forward history
  // first, then continues the set or moves on.
  document.getElementById('tBack').onclick = () => App.back();
  document.getElementById('tNext').onclick = () => App.next();
  document.getElementById('tPlay').onclick = () => {
    const y = App._state.yt; if (!y) return;
    y.getPlayerState() === 1 ? y.pauseVideo() : y.playVideo();
  };
  document.addEventListener('keydown', (e) => {
    if (['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); App.back(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); App.next(); }
  });

  // Is a model available? Decides whether starters talk or run scripted.
  try {
    const r = await fetch('/api/chat').then(r => r.json());
    window.MODEL_READY = !!r.configured;
  } catch (e) { window.MODEL_READY = false; }
  UI.modelStatus(window.MODEL_READY);

  const ok = await registerTools();
  if (!ok) UI.agentStatus('off');
  UI.modelStatus(window.MODEL_READY);
  await Demo.call('archive_stats', {});

  // ?demo=N runs a scripted line on load, for screenshots and the demo film
  const d = new URLSearchParams(location.search).get('demo');
  if (d !== null) {
    const i = Math.max(0, Math.min(4, Number(d) || 0));
    setTimeout(() => Demo.run(i), 700);
  }
})();
