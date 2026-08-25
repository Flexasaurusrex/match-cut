/* ==========================================================================
   Rendering. The agent and the person are looking at the same screen, so
   everything a tool changes has to be visible here.
   ========================================================================== */

const UI = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  // Six channels. Colour is assigned by what the channel measures, never for decoration.
  const CH = [
    { k:'motion',   label:'Motion',    c:'r', unit:'' },
    { k:'bright',   label:'Brightness',c:'',  unit:'' },
    { k:'warm',     label:'Warmth',    c:'r', unit:'' },
    { k:'sat',      label:'Saturation',c:'g', unit:'' },
    { k:'contrast', label:'Contrast',  c:'b', unit:'' },
    { k:'shotlen',  label:'Shot length',c:'', unit:'s' },
  ];

  let dist = {};   // per-channel distribution, for placing the pin

  function onCorpusReady(n) {
    $('cVideos').textContent = n.toLocaleString();
    const idx = App._state.index;
    for (const ch of CH) {
      const v = idx.map(c => c.fp[ch.k]).filter(x => x > 0).sort((a,b) => a-b);
      dist[ch.k] = { lo: v[Math.floor(v.length*0.02)], hi: v[Math.floor(v.length*0.98)] };
    }
    $('fp').innerHTML = CH.map(ch => `
      <div class="ch" data-c="${ch.c}" data-k="${ch.k}">
        <span class="lab">${ch.label}</span>
        <div class="val"><span data-v>—</span><u>${ch.unit}</u></div>
        <div class="scale">
          <div class="axis"></div>
          <div class="q" style="left:25%"></div><div class="q" style="left:50%"></div><div class="q" style="left:75%"></div>
          <div class="pin" style="left:50%;opacity:0"></div>
        </div>
      </div>`).join('');
    renderStarters();
  }

  const STARTERS = [
    'Play something by Michel Gondry and tell me why it matters',
    'Find a video that looks like this one but from a different era',
    'Something slow, warm and barely cut',
    'Walk me three connections out from here',
    'Build a set about surrealism in the 90s',
  ];
  function renderStarters() {
    $('starters').innerHTML = STARTERS.map((s,i) => `<button data-i="${i}">${esc(s)}</button>`).join('');
    $('starters').onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      Demo.run(Number(b.dataset.i));
    };
  }

  function paint(c, note) {
    $('empty').hidden = true; $('empty').style.display = 'none';
    $('meta').hidden = false;
    $('mTitle').innerHTML = `${esc(c.a)} <em>${esc(c.t)}</em>`;
    const f = [];
    if (c.y) f.push(`<span><b>${c.y}</b></span>`);
    if (c.d) f.push(`<span>dir. <b>${esc(c.d)}</b></span>`);
    if (c.nt) f.push(`<span>${esc(c.nt)}</span>`);
    if (c.ve) f.push(`<span>${esc(c.ve)}</span>`);
    f.push(`<span>tier <b>${c.tier}</b></span>`);
    $('mFacts').innerHTML = f.join('');
    const n = $('mNote');
    if (note) { n.hidden = false; n.textContent = note; } else { n.hidden = true; }
    paintFP(c);
    paintEdges(App.connections({ id: c.id }));
    // Blank the previous annotation; the new one arrives async. This replaces
    // #readHint, so never reach for that element again after the first paint.
    $('read').innerHTML = '<div class="hint">Reading the annotation\u2026</div>';
  }

  function paintFP(c) {
    for (const ch of CH) {
      const el = document.querySelector(`.fp .ch[data-k="${ch.k}"]`);
      if (!el) continue;
      const raw = c.fp[ch.k] || 0;
      const d = dist[ch.k] || { lo:0, hi:1 };
      const pct = Math.max(2, Math.min(98, ((raw - d.lo) / ((d.hi - d.lo) || 1)) * 100));
      el.querySelector('[data-v]').textContent = ch.k === 'shotlen' ? raw.toFixed(1) : Math.round(raw);
      const pin = el.querySelector('.pin');
      pin.style.left = pct + '%';
      pin.style.opacity = 1;
    }
  }

  function paintDetail(c, d) {
    if (!d) return;
    const parts = [];
    if (d.context)    parts.push(`<h3 class="lab">Cultural context</h3><p class="big">${esc(d.context)}</p>`);
    if (d.curatorial) parts.push(`<h3 class="lab">Curatorial assessment</h3><p>${esc(d.curatorial)}</p>`);
    if (d.sig)        parts.push(`<h3 class="lab">Genre significance</h3><p>${esc(d.sig)}</p>`);
    if (d.era)        parts.push(`<h3 class="lab">Era</h3><p>${esc(d.era)}</p>`);
    if (d.dbio)       parts.push(`<h3 class="lab">${esc(c.d || 'Director')}</h3><p>${esc(d.dbio)}</p>`);
    const chips = [...(c.tech||[]), ...(c.subs||[])].slice(0,10);
    if (chips.length) parts.push(`<h3 class="lab">Technique and subculture</h3><div class="chips">${chips.map(x=>`<b>${esc(x)}</b>`).join('')}</div>`);
    $('read').innerHTML = parts.join('') || '<div class="hint">No annotation for this one.</div>';
    $('read').scrollTop = 0;
  }

  function paintEdges(res) {
    const box = $('edges');
    if (!res || !res.connections || !res.connections.length) {
      box.innerHTML = '<div class="hint">No connections recorded for this video.</div>';
      $('edgeCount').textContent = '';
      return;
    }
    $('edgeCount').textContent = res.connections.length;
    box.innerHTML = res.connections.map(e => `
      <button class="edge" ${e.id ? `data-id="${e.id}"` : 'disabled'}>
        <div class="t">${esc(e.artist)} <u>${esc(e.title)}</u></div>
        <div class="why">${esc(e.reason)}${e.id ? '' : ' · not in archive'}</div>
      </button>`).join('');
    box.onclick = (ev) => {
      const b = ev.target.closest('.edge[data-id]'); if (!b) return;
      App.play({ id: b.dataset.id, note: 'Followed a connection from the panel' });
    };
  }

  function paintQueue(cards, title, note) {
    const n = $('mNote');
    n.hidden = false;
    n.textContent = `${title} — ${cards.length} videos. ${note || ''}`.trim();
  }

  function paintCalls(calls) {
    $('callCount').textContent = calls.length ? `${calls.length} call${calls.length>1?'s':''}` : 'idle';
    $('calls').innerHTML = calls.map(c => {
      const a = Object.keys(c.args||{}).length ? JSON.stringify(c.args) : '—';
      const r = c.result && c.result.error ? `error: ${c.result.error}`
        : c.result && c.result.results ? `${c.result.results.length} of ${c.result.total}`
        : c.result && c.result.connections ? `${c.result.connections.length} edges`
        : c.result && c.result.playing ? `now playing`
        : 'ok';
      return `<div class="call">
        <div class="h"><b>${esc(c.name)}</b><i>${c.ms}ms</i></div>
        <div class="a">${esc(a)}</div>
        <div class="r">${esc(r)}</div>
      </div>`;
    }).join('');
    flashTally();
  }

  // The tally must never claim an agent is attached when one is not. Amber is
  // reserved for a real WebMCP agent; blue means the page is running its own
  // scripted line so you can see the tools work without one.
  let tallyT, mode = 'off';
  function flashTally() {
    const t = $('tally');
    if (mode === 'off') return;
    t.dataset.state = mode === 'agent' ? 'live' : 'local';
    $('tallyText').textContent = mode === 'agent' ? 'Agent working' : 'Running here';
    clearTimeout(tallyT);
    tallyT = setTimeout(() => {
      t.dataset.state = mode === 'agent' ? 'ready' : 'local';
      $('tallyText').textContent = mode === 'agent' ? 'Agent connected' : 'No agent · demo';
    }, 1400);
  }

  function agentStatus(state, n) {
    const t = $('tally');
    if (state === 'ready') {
      mode = 'agent'; t.dataset.state = 'ready';
      $('tallyText').textContent = `${n} tools ready`;
    } else if (state === 'local') {
      mode = 'local'; t.dataset.state = 'local';
      $('tallyText').textContent = 'No agent · demo';
    } else {
      mode = 'off'; t.dataset.state = 'off';
      $('tallyText').textContent = 'No agent';
    }
  }

  function playerError() {
    const n = $('mNote'); n.hidden = false;
    n.textContent = 'That video will not play embedded. Try the next one.';
  }

  return { onCorpusReady, paint, paintDetail, paintEdges, paintQueue, paintCalls, agentStatus, playerError };
})();

window.UI = UI;
