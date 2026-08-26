/* ==========================================================================
   The opening. Real frames from the archive, cut hard on a rhythm, resolving
   into the wordmark. Then the sheet, once, and from the nav after that.
   ========================================================================== */

const Gate = (() => {
  const $ = (id) => document.getElementById(id);
  const SEEN = 'matchcut.read';

  // tier-one frames, chosen for contrast so they read at a glance
  const FRAMES = ["AEKbFMvkLIc","5jwT4SllZzg","DfcWOPpmw14","PzpLkcfBe-A","vPzDTfIb0DU",
    "COMWwwv_MTk","oitrWB8J2IY","1RZu71ahCtI","GgEwtp17RPM","kcPc18SG6uA","LjBo82hQXFA",
    "Kc1htX3q-F0","WZB7yswo6a0","BeaKNF5ci_M","FWZCSgtxzsw","LXUSaVw3Mvk","6J1-eYBbspA",
    "tALD-jmsSrk","aqhntKPh2EY","0j6g_uUhH2c","mIF6f3tFxBw","l35XzUD8GGU","ucw0twciNGk",
    "wKj92352UAE","KUmZp8pR1uc","OHTSxw6zN1E","NL-tvd8jeBc","BXkm6h6uq0k"];

  let timer;
  function runFilm() {
    const film = $('gateFilm');
    if (!film) return;
    const imgs = FRAMES.map(id => {
      const im = new Image();
      im.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      im.alt = '';
      film.appendChild(im);
      return im;
    });
    let i = 0;
    imgs[0].classList.add('on');
    // hard cuts, quick at first then settling, like a leader running out
    const beat = (n) => n < 10 ? 110 : n < 18 ? 170 : 300;
    const step = () => {
      imgs[i % imgs.length].classList.remove('on');
      i++;
      imgs[i % imgs.length].classList.add('on');
      timer = setTimeout(step, beat(i));
    };
    timer = setTimeout(step, 110);
  }

  function runMeter() {
    const m = $('gateMeter');
    if (!m) return;
    // six channels x six readings, sweeping to real-looking positions
    const heights = [7,18,11,26,9,15, 22,6,19,13,25,10, 8,24,12,20,7,17,
                     14,9,23,11,26,8, 19,13,7,21,10,25, 12,26,9,16,22,6];
    m.innerHTML = heights.map((h,i) =>
      `<span style="--h:${h}px;animation-delay:${0.9 + i * 0.02}s"></span>`).join('');
  }

  function openSheet() { $('sheet').hidden = false; $('sheetX').focus(); }
  function closeSheet() {
    $('sheet').hidden = true;
    try { localStorage.setItem(SEEN, '1'); } catch (e) {}
    $('say') && !$('say').disabled && $('say').focus();
  }

  function enter() {
    clearTimeout(timer);
    const g = $('gate');
    g.classList.add('out');
    setTimeout(() => {
      g.remove();
      let seen = false;
      try { seen = !!localStorage.getItem(SEEN); } catch (e) {}
      if (!seen) openSheet();
    }, 480);
  }

  function init() {
    const q = new URLSearchParams(location.search);
    // ?demo runs a scripted line straight away, so skip the opening
    if (q.has('demo')) { const g = $('gate'); if (g) g.remove(); }
    // ?about opens straight to the writeup, for sharing and for the demo film
    if (q.has('about')) {
      const g = $('gate'); if (g) g.remove();
      openSheet();
    }
    runFilm();
    runMeter();
    const e = $('enter'); if (e) e.addEventListener('click', enter);
    $('info').addEventListener('click', openSheet);
    $('sheetX').addEventListener('click', closeSheet);
    $('sheetGo').addEventListener('click', closeSheet);
    $('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) closeSheet(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('sheet').hidden) closeSheet();
      const g = $('gate');
      if (e.key === 'Enter' && g && !g.classList.contains('out')) enter();
    });
  }
  return { init, openSheet };
})();

Gate.init();
window.Gate = Gate;
