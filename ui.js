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

  function onCorpusReady(n, ms) {
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
    document.body.dataset.empty = '1';
    renderStarters();
    const g = $('gateStatus');
    if (g) g.textContent = `${n.toLocaleString()} videos ready in ${ms}ms`;
  }

  function deepReady() {
    const g = $('gateStatus');
    if (g) g.textContent = '';
  }

  // Cold openers are built from the archive itself and reshuffled every load.
  // A fixed list of five makes 7,139 videos look like a menu of five.
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

  let STARTERS = [];

  function buildStarters() {
    const idx = App._state.index;
    if (!idx.length) return;

    const dirCount = {};
    for (const c of idx) if (c.d) dirCount[c.d] = (dirCount[c.d] || 0) + 1;
    const directors = Object.keys(dirCount).filter(d => dirCount[d] >= 6);
    const bigArtists = [...new Set(idx.filter(c => Number(c.tier) === 1).map(c => c.a))];
    const decades = ['70s', '80s', '90s', '2000s'];
    const looks = [
      'Something slow, warm and barely cut',
      'Something frantic, cold and cut to pieces',
      'Something very dark that barely moves',
      'The brightest, most saturated thing in here',
      'Something shot like a documentary but is not one',
    ];
    const kinds = [
      () => `Play something by ${pick(directors)} and tell me why it matters`,
      () => pick(looks),
      () => `Build a set about ${pick(['surrealism', 'realism', 'experimental film', 'performance'])} in the ${pick(decades)}`,
      () => pick([
        'What is the oldest video in this archive?',
        'Find the strangest thing in here and explain it',
        'Show me a video the archive is unsure about',
        'What is the most cut video in here?',
      ]),
      () => `Find something that looks like ${pick(bigArtists)} but is not`,
    ];
    STARTERS = kinds.map(f => { try { return f(); } catch (e) { return null; } }).filter(Boolean);
    STARTERS = shuffle(STARTERS);
  }

  // Follow-ups only appear once there is a video to refer to.
  const FOLLOWUPS = [
    ['Something that looks like this, from another era', 1],
    ['Find me the record for this', 2],
    ['Why does this one matter?', 2],
    ['Follow a connection from here', 3],
    ['Keep this one, I like it', 2],
  ];

  function renderStarters() {
    buildStarters();
    $('starters').innerHTML = STARTERS.map((s, i) => `<button data-i="${i}">${esc(s)}</button>`).join('');
    $('starters').onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const text = STARTERS[Number(b.dataset.i)];
      if (window.Chat && window.MODEL_READY) Chat.ask(text);
      else Demo.run(Number(b.dataset.i) % 5);
    };
  }

  function renderFollowups() {
    const box = $('followups');
    if (!box) return;
    box.innerHTML = FOLLOWUPS.map(([t], i) => `<button data-i="${i}">${esc(t)}</button>`).join('');
    box.hidden = false;
    box.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const [text, demoIdx] = FOLLOWUPS[Number(b.dataset.i)];
      if (window.Chat && window.MODEL_READY) Chat.ask(text);
      else Demo.run(demoIdx);
    };
  }

  function paint(c, note) {
    document.body.removeAttribute('data-empty');
    $('empty').hidden = true; $('empty').style.display = 'none';
    $('meta').hidden = false;
    $('mTitle').innerHTML = `${esc(c.a)} <em>${esc(c.t)}</em>`;
    const f = [];
    if (c.y) f.push(`<span><b>${c.y}</b></span>`);
    if (c.d) {
      // Say how sure the archive is. An attribution presented flatly is a claim;
      // one carrying its confidence is evidence.
      const weak = c.dc && c.dc !== 'confirmed';
      f.push(`<span>dir. <b>${esc(c.d)}</b>${weak ? ` <u title="the archive records this attribution as ${esc(c.dc)}">${esc(c.dc)}</u>` : ''}</span>`);
    } else if (c.dc === 'unknown') {
      f.push(`<span>director <u>unrecorded</u></span>`);
    }
    if (c.nt) f.push(`<span>${esc(c.nt)}</span>`);
    if (c.ve) f.push(`<span>${esc(c.ve)}</span>`);
    f.push(`<span>tier <b>${c.tier}</b></span>`);
    $('mFacts').innerHTML = f.join('');
    const n = $('mNote');
    if (note) { n.hidden = false; n.textContent = note; } else { n.hidden = true; }
    paintFP(c);
    markKept();
    const sh = $('shop'); if (sh) sh.hidden = true;   // pressings are per artist
    paintEdges(App.connections({ id: c.id }));
    // Blank the previous annotation; the new one arrives async. This replaces
    // #readHint, so never reach for that element again after the first paint.
    $('read').innerHTML = '<div class="hint">Reading the annotation\u2026</div>';
    renderFollowups();
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
    const wrap = $('connWrap');
    if (wrap) wrap.hidden = !(res && res.connections && res.connections.length);
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
    n.textContent = `${title}. ${note || ''}`.trim();
    paintSet(cards, title, 0);
  }

  // A set should look like a set: the running order, where you are in it, and
  // what is next. Queueing silently made it look like one video playing.
  function paintSet(cards, title, idx) {
    const bar = $('setbar');
    if (!bar) return;
    if (!cards || cards.length < 2) { bar.hidden = true; return; }
    bar.hidden = false;
    $('setTitle').textContent = title || 'Set';
    $('setPos').textContent = `${idx + 1} of ${cards.length}`;
    $('setrun').innerHTML = cards.map((c, i) => `
      <button class="cue ${i === idx ? 'now' : i < idx ? 'done' : ''}" data-id="${c.id}">
        <div class="n">${i === idx ? 'NOW' : String(i + 1).padStart(2, '0')}</div>
        <div class="a">${esc(c.a)}</div>
        <div class="t">${esc(c.t)}</div>
      </button>`).join('');
    $('setrun').onclick = (e) => {
      const b = e.target.closest('.cue'); if (!b) return;
      App.jumpTo(b.dataset.id);
    };
    const now = $('setrun').querySelector('.cue.now');
    if (now) now.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  function setPosition(idx, total) {
    const bar = $('setbar');
    if (!bar || bar.hidden) return;
    $('setPos').textContent = `${idx + 1} of ${total}`;
    [...$('setrun').children].forEach((el, i) => {
      el.classList.toggle('now', i === idx);
      el.classList.toggle('done', i < idx);
      el.querySelector('.n').textContent = i === idx ? 'NOW' : String(i + 1).padStart(2, '0');
    });
    const now = $('setrun').querySelector('.cue.now');
    if (now) now.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  function paintCalls(calls) {
    $('callCount').textContent = calls.length ? `${calls.length} call${calls.length>1?'s':''}` : 'idle';
    const box = $('calls');
    if (!box) { flashTally(); return; }
    box.innerHTML = calls.map(c => {
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

  // The tally reports WHO is driving the page, and never overstates it.
  //   webmcp : an external agent registered through document.modelContext
  //   chat   : the in-page conversation, which calls the same tools
  //   none   : no model anywhere, starter lines run a scripted stand-in
  let tallyT, driver = 'none';
  const LABEL = {
    webmcp: { idle: 'WebMCP agent', busy: 'Agent working' },
    chat:   { idle: 'In-page agent', busy: 'Agent working' },
    none:   { idle: 'No agent \u00b7 demo', busy: 'Running here' },
  };
  function setTally(busy) {
    const t = $('tally');
    t.dataset.state = driver === 'none' ? 'local' : busy ? 'live' : 'ready';
    $('tallyText').textContent = LABEL[driver][busy ? 'busy' : 'idle'];
  }
  function flashTally() {
    setTally(true);
    clearTimeout(tallyT);
    tallyT = setTimeout(() => setTally(false), 1400);
  }

  // An external agent outranks the in-page one, because it is the harder thing
  // to have working and the thing the page is really built for.
  function agentStatus(state, n) {
    if (state === 'ready') {
      driver = 'webmcp';
      $('tally').title = `${n} tools registered through document.modelContext`;
    } else if (driver !== 'webmcp') {
      driver = window.MODEL_READY ? 'chat' : 'none';
    }
    setTally(false);
  }

  function modelStatus(ready) {
    const say = $('say'), send = $('send');
    if (!ready) {
      say.placeholder = 'Conversation is off. Press a line above instead.';
      say.disabled = true; send.disabled = true;
      $('callCount').textContent = 'no model';
    } else {
      $('callCount').textContent = 'ready';
    }
    if (driver !== 'webmcp') driver = ready ? 'chat' : 'none';
    $('tally').title = ready
      ? 'The conversation in this panel calls the page tools directly'
      : 'No agent attached and no model configured';
    setTally(false);
  }

  function paintRecords(artist, releases) {
    const bar = $('shop');
    if (!bar) return;
    if (!releases || !releases.length) { bar.hidden = true; return; }
    bar.hidden = false;
    $('shopNote').textContent = `${artist} \u00b7 lowest listed on Discogs`;
    $('shoprun').innerHTML = releases.map(r => `
      <a class="rec" href="${esc(r.buy)}" target="_blank" rel="noopener">
        <span class="sleeve">${r.thumb ? `<img src="${esc(r.thumb)}" alt="" loading="lazy">` : ''}</span>
        <span class="b">
          <span class="t">${esc(r.title)}</span>
          <span class="m">${[r.year, r.format, r.label].filter(Boolean).map(esc).join(' \u00b7 ')}</span>
          <span class="p">
            <b>${r.lowest_price != null ? '$' + Number(r.lowest_price).toFixed(2) : 'see listing'}</b>
            <u>${r.copies_for_sale ? r.copies_for_sale + ' for sale' : 'Discogs'}</u>
          </span>
        </span>
      </a>`).join('');
  }

  // The collection, as a place rather than a strip. Play all reuses the set
  // machinery, so a run of your favourites gets the same running order.
  function openKept() {
    paintKeptSheet();
    $('keptSheet').hidden = false;
    $('keptX').focus();
  }
  function closeKept() { $('keptSheet').hidden = true; }

  function paintKeptSheet() {
    const keep = App._state.keep;
    const cards = keep.map(k => ({ k, c: App._state.byId.get(k.id) })).filter(x => x.c);
    $('keptLede').textContent = cards.length
      ? `${cards.length} video${cards.length > 1 ? 's' : ''} you have kept. Play them as a run, or pick one.`
      : 'Nothing kept yet. Press the heart while something is playing, or tell the agent you like it.';
    $('keptActions').hidden = !cards.length;
    $('keptList').innerHTML = cards.map(({ k, c }) => `
      <div class="krow" data-id="${c.id}">
        <img src="https://i.ytimg.com/vi/${c.vid || c.id}/mqdefault.jpg" alt="" loading="lazy">
        <span class="n">
          <b>${esc(c.a)}</b>
          <span>${esc(c.t)}${c.y ? ' \u00b7 ' + c.y : ''}</span>
          ${k.why ? `<em>${esc(k.why)}</em>` : ''}
        </span>
        <span class="act">
          <button data-act="play" title="Play this">&#9654;</button>
          <button data-act="drop" title="Remove">&times;</button>
        </span>
      </div>`).join('');
    $('keptList').onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const id = b.closest('.krow').dataset.id;
      if (b.dataset.act === 'play') { App.play({ id, note: 'From your collection.' }); closeKept(); }
      else { App.dropIt({ id }); paintKeptSheet(); }
    };
  }

  function paintKeep(cards, meta) {
    const btn = $('keptBtn');
    if (btn) {
      btn.querySelector('i').textContent = App._state.keep.length;
      btn.dataset.any = App._state.keep.length ? '1' : '0';
    }
    if ($('keptSheet') && !$('keptSheet').hidden) paintKeptSheet();
    const bar = $('keepbar');
    if (!bar) return;
    if (!cards.length) { bar.hidden = true; return; }
    bar.hidden = false;
    $('keepCount').textContent = `${cards.length}`;
    $('keeprun').innerHTML = cards.map((c, i) => `
      <button class="kept" data-id="${c.id}">
        <div class="a">${esc(c.a)}</div>
        <div class="t">${esc(c.t)}</div>
        ${meta[i] && meta[i].why ? `<div class="w">${esc(meta[i].why)}</div>` : ''}
      </button>`).join('');
    $('keeprun').onclick = (e) => {
      const b = e.target.closest('.kept'); if (!b) return;
      App.play({ id: b.dataset.id, note: 'From your collection.' });
    };
    markKept();
  }

  function shopBusy(on) {
    const b = $('tShop');
    if (b) { b.disabled = !!on; b.style.opacity = on ? '.5' : ''; }
  }

  function markKept() {
    const btn = $('tKeep');
    if (!btn) return;
    const cur = App.nowPlaying().playing;
    const on = cur && App._state.keep.some(k => k.id === cur.id);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? 'Kept' : 'Keep this one';
  }

  function transport(canBack, canNext) {
    const b = $('tBack'), n = $('tNext');
    if (b) b.disabled = !canBack;
    if (n) n.disabled = !canNext;
  }

  function playState(playing) {
    const p = $('tPlay');
    if (p) p.innerHTML = playing ? '&#10074;&#10074;' : '&#9654;';
  }

  function playerError(blocked, next) {
    const n = $('mNote'); n.hidden = false;
    n.textContent = next
      ? `${blocked ? blocked.artist + ' \u2013 ' + blocked.title : 'That video'} is blocked from embedding by the rights holder. Moving to the next match.`
      : 'That video is blocked from embedding and nothing nearby is playable.';
  }

  return { onCorpusReady, paint, paintDetail, paintEdges, paintQueue, paintSet, setPosition, paintCalls, agentStatus, playerError, modelStatus, transport, playState, deepReady, paintKeep, markKept, paintRecords, shopBusy, openKept, closeKept };
})();

window.UI = UI;
