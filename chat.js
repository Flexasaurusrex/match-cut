/* ==========================================================================
   The conversation. Tools run in this page, because they change what the
   person is looking at. The endpoint only decides which one to call next.
   ========================================================================== */

const Chat = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const thread = () => $('thread');
  let history = [], busy = false, cleared = false;

  function clearHint() {
    if (cleared) return;
    thread().innerHTML = '';
    cleared = true;
  }
  function scroll() { thread().scrollTop = thread().scrollHeight; }

  function turn(who, text) {
    if (window.notifyTalk) notifyTalk();
    clearHint();
    const d = document.createElement('div');
    d.className = 'turn ' + (who === 'you' ? 'you' : 'them');
    d.innerHTML = `<div class="who">${who === 'you' ? 'You' : 'Match Cut'}</div><div class="b">${esc(text)}</div>`;
    thread().appendChild(d); scroll();
    return d;
  }
  function thinking() {
    clearHint();
    const d = document.createElement('div');
    d.className = 'turn them';
    d.innerHTML = `<div class="who">Match Cut</div><div class="b"><span class="dots"><i></i><i></i><i></i></span></div>`;
    thread().appendChild(d); scroll();
    return d;
  }
  function note(text) {
    if (window.notifyTalk) notifyTalk();
    clearHint();
    const d = document.createElement('div');
    d.className = 'note-line';
    d.textContent = text;
    thread().appendChild(d); scroll();
  }

  function toolCall(name, args, result, ms) {
    if (window.notifyTalk) notifyTalk();
    clearHint();
    const r = result && result.error ? `error: ${result.error}`
      : result && result.results ? `${result.results.length} of ${result.total}`
      : result && result.connections ? `${result.connections.length} edges`
      : result && result.playing ? 'now playing'
      : 'ok';
    const d = document.createElement('div');
    d.className = 'tc';
    d.innerHTML = `<span class="ms">${ms}ms</span><b>${esc(name)}</b>
      <div class="a">${esc(Object.keys(args||{}).length ? JSON.stringify(args) : '—')}</div>
      <div class="r">${esc(r)}</div>`;
    thread().appendChild(d); scroll();
  }

  const ask = (text) => run(text, true);
  const nudge = (text) => run(text, false);

  async function run(text, fromPerson) {
    if (busy || !text.trim()) return;
    busy = true; $('send').disabled = true;
    if (fromPerson) turn('you', text);
    history.push({ role: 'user', content: text });

    const schemas = TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
    let spinner = thinking();
    let played = false, lastResults = null;

    try {
      for (let hop = 0; hop < 6; hop++) {
        const res = await fetch('/api/chat', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          // The screen can change without the agent touching it: a set advances,
          // the person hits next, continuous play moves on. Send the current
          // state every turn so "this one" always means what is actually on.
          body: JSON.stringify({ messages: history, tools: schemas, state: App.nowPlaying() }),
        }).then(r => r.json()).catch(e => ({ error: String(e.message || e) }));

        spinner.remove();

        if (res.unconfigured) { turn('them', res.message); break; }
        if (res.error) { turn('them', `Could not reach the model. ${res.error}`); break; }
        const msg = res.message;
        if (!msg) { turn('them', 'The model returned nothing.'); break; }

        history.push(msg);
        if (msg.content) turn('them', msg.content);

        const calls = msg.tool_calls || [];
        if (!calls.length) break;

        for (const c of calls) {
          const tool = TOOLS.find(t => t.name === c.function.name);
          let args = {};
          try { args = JSON.parse(c.function.arguments || '{}'); } catch (e) {}
          const t0 = performance.now();
          let out;
          try { out = tool ? await tool.run(args) : { error: `no tool named ${c.function.name}` }; }
          catch (e) { out = { error: String(e.message || e) }; }
          const ms = Math.round(performance.now() - t0);
          if (c.function.name === 'play' && out && out.playing) played = true;
          if (out && out.results && out.results.length) lastResults = out.results;
          toolCall(c.function.name, args, out, ms);
          App.logCall(c.function.name, args, out, ms);
          history.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(out).slice(0, 6000) });
        }
        spinner = thinking();
      }
    } finally {
      const s = thread().querySelector('.dots'); if (s) s.closest('.turn').remove();
      // Safety net for the one failure that breaks the premise: it found a video,
      // told you about it, and left the screen empty. Only fires when nothing is
      // playing at all, so it can never interrupt something you are watching.
      if (!played && lastResults && !App.nowPlaying().playing) {
        const pick = lastResults[0];
        const out = await TOOLS.find(t => t.name === 'play').run({ id: pick.id, note: 'Putting it on screen.' });
        toolCall('play', { id: pick.id }, out, 0);
        App.logCall('play', { id: pick.id }, out, 0);
      }
      busy = false; $('send').disabled = false; scroll();
    }
  }

  function init() {
    $('composer').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $('say').value; $('say').value = '';
      ask(v);
    });
  }
  return { init, ask, nudge, note, get busy() { return busy; } };
})();
window.Chat = Chat;
