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
    const playing = App.nowPlaying().playing;

    if (!on) {
      say('Stopped. Nothing will play by itself now.');
      return;
    }
    if (!playing) {
      // Empty screen: start the run immediately.
      advance('Start a run. Pick something worth watching, play it, and say why in one line.');
      return;
    }
    // Something is already running. Do not hijack it, but do not sit silent
    // either: say what happens next, and line up the pick now so the handover
    // is instant when the video ends.
    say(`Keeping it going. ${playing.artist} plays out, then I choose the next one.`);
    lineUp();
  }

  function say(text) {
    if (window.Chat && Chat.note) Chat.note(text);
  }

  // Look ahead without touching the screen, so the wait is visibly productive.
  async function lineUp() {
    if (!on || working) return;
    const c = App.connections({});
    const live = (c.connections || []).filter(e => e.in_archive);
    if (live.length) {
      const e = live[Math.floor(Math.random() * Math.min(5, live.length))];
      queued = e;
      say(`Lined up: ${e.artist} \u2014 ${e.title}. ${e.reason}.`);
    }
  }

  let queued = null;

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
  function ended() {
    if (!on) return;
    if (queued && !App._state.dead.has(queued.id)) {
      const e = queued; queued = null;
      App.play({ id: e.id, note: e.reason });
      say(`Following: ${e.reason}.`);
      lineUp();
      return;
    }
    advance();
  }

  function init() {
    const b = $('radio');
    if (!b) return;
    b.addEventListener('click', toggle);
    setLabel();
  }

  return { init, ended, toggle, get on() { return on; } };
})();

window.Radio = Radio;
