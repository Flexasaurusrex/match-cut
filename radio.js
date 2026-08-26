/* ==========================================================================
   Continuous play. The agent keeps the screen fed and says why each time.
   Off by default: nothing autonomous happens until you ask for it.
   ========================================================================== */

const Radio = (() => {
  const $ = (id) => document.getElementById(id);
  let on = false, working = false;

  // What the app tells the agent when a video runs out. Not shown as if the
  // person typed it, because they did not.
  const NUDGE = [
    'That video just finished. Choose what plays next and put it on. Prefer follow_connection ' +
    'so the run has a thread through it, or find_by_look to change the light. One sentence on ' +
    'why you picked it, then play it.',

    'Keep the run going. Pick something that answers the last video rather than merely ' +
    'resembling it, play it, and say in one line what the two have to do with each other.',

    'Next one. Move somewhere the last video pointed, play it, and name the connection you took.',
  ];

  function setLabel() {
    const b = $('radio');
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.querySelector('span').textContent = on ? 'Keeping it going' : 'Keep it going';
  }

  function toggle() {
    on = !on;
    setLabel();
    if (!on) return;
    // If the screen is empty, start the run rather than waiting for an ending.
    if (!App.nowPlaying().playing) advance('Start a run. Pick something worth watching, play it, and say why in one line.');
  }

  async function advance(text) {
    if (!on || working) return;
    working = true;
    try {
      if (window.MODEL_READY && window.Chat) {
        await Chat.nudge(text || NUDGE[Math.floor(Math.random() * NUDGE.length)]);
      } else {
        // No model: walk the graph anyway, and quote the edge's own reason.
        const c = App.connections({});
        const live = (c.connections || []).filter(e => e.in_archive);
        if (live.length) {
          const e = live[Math.floor(Math.random() * Math.min(5, live.length))];
          App.play({ id: e.id, note: e.reason });
        } else {
          const r = App.findByLook({ limit: 8 });
          if (r.results && r.results.length) {
            const p = r.results[Math.floor(Math.random() * r.results.length)];
            App.play({ id: p.id, note: 'Continuing on look.' });
          }
        }
      }
    } finally { working = false; }
  }

  // App calls this when a video runs out.
  function ended() { if (on) advance(); }

  function init() {
    const b = $('radio');
    if (!b) return;
    b.addEventListener('click', toggle);
    setLabel();
  }

  return { init, ended, toggle, get on() { return on; } };
})();

window.Radio = Radio;
