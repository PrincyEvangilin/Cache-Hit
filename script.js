(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const TOTAL = 100;
  const KEY = 'memoryMatch100.v1';
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const SYMBOLS = [
    ['💻', 'Laptop'], ['🖥️', 'Desktop'], ['⌨️', 'Keyboard'], ['🖱️', 'Mouse'],
    ['💾', 'Floppy disk'], ['🔌', 'Plug'], ['🔋', 'Battery'], ['📡', 'Antenna'],
    ['🤖', 'Robot'], ['👾', 'Alien'], ['🐛', 'Bug'], ['🚀', 'Rocket'],
    ['🧠', 'Brain'], ['🔒', 'Lock'], ['🔑', 'Key'], ['⚙️', 'Gear'],
    ['🌐', 'Globe'], ['📱', 'Phone']
  ];

  // Pairs per block of 10 levels, and the grid columns for each card total
  const TIERS = [4, 5, 6, 8, 9, 10, 12, 15, 18, 18];
  const COLS = { 6: 3, 8: 4, 10: 5, 12: 4, 16: 4, 18: 6, 20: 5, 24: 6, 30: 6, 36: 6 };

  const board = $('#board');
  const fx = $('#fx');

  /* ---------- Settings and sound (every sound is generated in code, no audio files) ---------- */

  const SKEY = 'memoryMatch100.settings';
  const settings = (() => {
    let s = { sfx: true, music: true, vol: 70 };
    try { s = Object.assign(s, JSON.parse(localStorage.getItem(SKEY))); } catch (e) { /* use defaults */ }
    s.sfx = s.sfx !== false;
    s.music = s.music !== false;
    s.vol = Math.min(100, Math.max(0, Number(s.vol) || 0));
    return s;
  })();
  const saveSettings = () => {
    try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch (e) { /* storage blocked */ }
  };

  let ac = null;
  let master = null;
  function audio() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.connect(ac.destination);
    }
    master.gain.value = settings.vol / 100;
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function tone(freq, dur, type, vol, delay) {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + (delay || 0);
    const o = a.createOscillator();
    const gn = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn);
    gn.connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  const SFX = {
    tap: () => tone(700, 0.06, 'square', 0.1),
    flip: () => tone(520, 0.09, 'triangle', 0.3),
    match: () => { tone(660, 0.12, 'sine', 0.3); tone(880, 0.22, 'sine', 0.3, 0.1); },
    miss: () => tone(170, 0.28, 'sawtooth', 0.15),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.3, i * 0.12)),
    lose: () => [440, 370, 311, 262].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.14, i * 0.16)),
    trophy: () => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, 'triangle', 0.3, i * 0.14))
  };
  const play = (name) => { if (settings.sfx) SFX[name](); };

  // Simple looping tune
  const SCALE = [262, 294, 330, 392, 440, 523, 587, 659];
  const TUNE = [0, 2, 4, 2, 5, 4, 2, 1, 0, 2, 4, 7, 5, 4, 2, 0];
  let mTimer = 0;
  let mStep = 0;
  function stopMusic() { clearInterval(mTimer); mTimer = 0; }
  function startMusic() {
    stopMusic();
    if (!settings.music || !audio()) return;
    mTimer = setInterval(() => {
      const n = TUNE[mStep++ % TUNE.length];
      tone(SCALE[n], 0.3, 'triangle', 0.08);
      if (mStep % 4 === 1) tone(SCALE[n] / 2, 0.9, 'sine', 0.1);
    }, 320);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopMusic();
    else if (ac) startMusic();
  });

  /* ---------- Saved progress (stays on the current level after refresh) ---------- */

  const fresh = () => ({ level: 1, stars: 0, done: false });

  function load() {
    let d = fresh();
    try { d = Object.assign(d, JSON.parse(localStorage.getItem(KEY))); } catch (e) { /* use defaults */ }
    d.level = Math.min(TOTAL, Math.max(1, Math.floor(Number(d.level)) || 1));
    d.stars = Math.max(0, Math.floor(Number(d.stars)) || 0);
    d.done = d.done === true;
    return d;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* storage blocked */ }
  }

  let data = load();
  let g = { moves: 0, p: { cols: 4 } };

  /* ---------- Helpers ---------- */

  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const fmt = (ms) => {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  const msg = (t) => { $('#msg').textContent = t; };
  // Run a delayed step only if the same level is still being played
  const later = (ms, fn) => {
    const mine = g;
    setTimeout(() => { if (g === mine) fn(); }, ms);
  };

  function params(level) {
    const pairs = TIERS[Math.min(9, Math.floor((level - 1) / 10))];
    const total = pairs * 2;
    const cols = COLS[total];
    return {
      pairs, total, cols, rows: total / cols,
      preview: Math.max(500, 1300 + pairs * 50 - level * 13),
      limit: Math.ceil(pairs * (3.4 - level * 0.015)), // moves allowed before the level fails
      every: level >= 15 ? Math.max(2, 6 - Math.floor((level - 15) / 17)) : 0 // shuffle after this many misses
    };
  }

  function updateHud() {
    $('#level').textContent = data.level;
    $('#stars').textContent = data.stars;
    $('#bar').style.width = ((data.done ? TOTAL : data.level - 1) / TOTAL * 100) + '%';
  }

  const twist = () => {
    const e = g.p.every;
    return e ? 'Cards shuffle after ' + (e - (g.misses % e)) + ' misses' : 'Find the pairs!';
  };

  /* ---------- Level setup ---------- */

  function makeCard(sym, i) {
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'card';
    c.dataset.sym = sym;
    c.style.cssText =
      '--i:' + i + ';--c:' + (i % g.p.cols) + ';--r:' + Math.floor(i / g.p.cols) +
      ';--rot:' + Math.floor(Math.random() * 80 - 40) + 'deg;--h:' + sym * 20;
    c.setAttribute('aria-label', 'Card, face down');
    c.innerHTML =
      '<div class="float"><div class="inner"><div class="face back"></div>' +
      '<div class="face front">' + SYMBOLS[sym][0] + '</div></div></div>';
    c.addEventListener('click', () => flip(c));
    return c;
  }

  function startLevel() {
    clearInterval(g.timer);
    $('#overlay').hidden = true;
    fx.replaceChildren();

    const p = params(data.level);
    const picks = shuffle(SYMBOLS.map((_, i) => i)).slice(0, p.pairs);
    const deck = shuffle(picks.flatMap((i) => [i, i]));
    g = { p, first: null, lock: true, moves: 0, misses: 0, found: 0, started: false, timer: 0, t0: 0 };

    board.style.setProperty('--cols', p.cols);
    board.style.setProperty('--rows', p.rows);
    board.style.setProperty('--mx', (p.cols - 1) / 2);
    board.style.setProperty('--my', (p.rows - 1) / 2);
    board.replaceChildren(...deck.map(makeCard));

    $('#moves').textContent = '0 / ' + p.limit;
    $('#time').textContent = '0:00';
    updateHud();
    msg('Get ready…');

    const cards = () => [...board.children];
    later(calm ? 100 : 700 + p.total * 35, () => {
      cards().forEach((c) => show(c, true));
      msg('Memorize the cards!');
      later(p.preview + 600, () => {
        cards().forEach((c) => show(c, false));
        g.lock = false;
        msg(twist());
      });
    });
  }

  /* ---------- Playing ---------- */

  function show(c, up) {
    c.classList.toggle('up', up);
    c.setAttribute('aria-label', up ? SYMBOLS[c.dataset.sym][1] : 'Card, face down');
  }

  function flip(c) {
    if (g.lock || c.classList.contains('up')) return;
    if (!g.started) {
      g.started = true;
      g.t0 = Date.now();
      g.timer = setInterval(() => { $('#time').textContent = fmt(Date.now() - g.t0); }, 500);
    }
    play('flip');
    show(c, true);
    if (!g.first) { g.first = c; return; }

    const a = g.first;
    const b = c;
    g.first = null;
    g.moves++;
    $('#moves').textContent = g.moves + ' / ' + g.p.limit;

    if (a.dataset.sym === b.dataset.sym) {
      g.found++;
      later(450, () => {
        play('match');
        [a, b].forEach((x) => { x.classList.add('matched'); x.disabled = true; burst(x); });
        if (g.found === g.p.pairs) win();
      });
    } else {
      g.lock = true;
      g.misses++;
      later(500, () => { play('miss'); [a, b].forEach((x) => x.classList.add('shake')); });
      later(1100, () => {
        [a, b].forEach((x) => { x.classList.remove('shake'); show(x, false); });
        if (g.moves >= g.p.limit) { lose(); return; }
        const e = g.p.every;
        if (e && g.misses % e === 0) {
          msg('Shuffle!');
          shuffleLeft();
          later(900, () => { g.lock = false; msg(twist()); });
        } else {
          g.lock = false;
          msg(twist());
        }
      });
    }
  }

  // Moves the unmatched cards to new spots with a smooth glide
  function shuffleLeft() {
    const all = [...board.children];
    const left = all.filter((c) => !c.classList.contains('matched'));
    const before = new Map(left.map((c) => [c, c.getBoundingClientRect()]));
    const order = shuffle(left.slice());
    let k = 0;
    board.replaceChildren(...all.map((c) => (c.classList.contains('matched') ? c : order[k++])));
    order.forEach((c) => {
      const a = before.get(c);
      const b = c.getBoundingClientRect();
      c.animate(
        [{ transform: 'translate(' + (a.left - b.left) + 'px,' + (a.top - b.top) + 'px)' }, { transform: 'none' }],
        { duration: calm ? 1 : 700, easing: 'cubic-bezier(.3,1.3,.5,1)' }
      );
    });
  }

  /* ---------- Finishing ---------- */

  function showPanel(art, cls, title, text, btn, fn) {
    const part = $('#part');
    part.innerHTML = art;
    part.className = 'art ' + cls;
    $('#ptitle').textContent = title;
    $('#ptext').textContent = text;
    const b = $('#pbtn');
    b.textContent = btn;
    b.onclick = () => { play('tap'); fn(); };
    $('#overlay').hidden = false;
    b.focus();
  }

  function win() {
    clearInterval(g.timer);
    const elapsed = Date.now() - g.t0;
    const ratio = g.moves / g.p.pairs;
    const n = ratio <= 2.2 ? 3 : ratio <= 3.5 ? 2 : 1;
    const done = data.level;
    const moves = g.moves;
    data.stars += n;
    if (done >= TOTAL) data.done = true; else data.level = done + 1;
    save();
    updateHud();

    later(700, () => {
      if (data.done) { trophy(); return; }
      const stars = [0, 1, 2].map((i) => '<span style="--k:' + i + '">' + (i < n ? '⭐' : '☆') + '</span>').join('');
      play('win');
      showPanel(stars, '', 'Level ' + done + ' complete!', moves + ' moves in ' + fmt(elapsed), 'Next level', startLevel);
    });
  }

  function lose() {
    clearInterval(g.timer);
    g.lock = true;
    play('lose');
    showPanel('😵', '', 'Out of moves', 'Level ' + data.level + ' is still waiting. Try again!', 'Retry', startLevel);
  }

  function trophy() {
    confetti();
    play('trophy');
    showPanel('<b>🏆</b>', 'trophy', 'You did it!',
      'All 100 levels complete with ' + data.stars + ' stars.', 'Play again from level 1',
      () => { data = fresh(); save(); startLevel(); });
  }

  /* ---------- Effects ---------- */

  function burst(c) {
    if (calm) return;
    const r = c.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    for (let i = 0; i < 10; i++) {
      const s = document.createElement('i');
      const ang = (Math.PI * 2 * i) / 10;
      const d = 40 + Math.random() * 40;
      s.className = 'spark';
      s.style.cssText =
        'left:' + cx + 'px;top:' + cy + 'px;--tx:' + Math.cos(ang) * d + 'px;--ty:' + Math.sin(ang) * d +
        'px;--c:hsl(' + c.dataset.sym * 20 + ' 100% 60%)';
      fx.append(s);
      setTimeout(() => s.remove(), 800);
    }
  }

  function confetti() {
    if (calm) return;
    const colors = ['#ff2e93', '#7b2ff7', '#00e5ff', '#b6ff3b', '#ffd600', '#ff7a18'];
    for (let i = 0; i < 90; i++) {
      const e = document.createElement('i');
      e.className = 'confetti';
      e.style.cssText =
        '--x:' + Math.random() * 100 + '%;--c:' + colors[i % 6] + ';--d:' + (2.5 + Math.random() * 2.5) +
        's;--w:' + Math.random() * 1.5 + 's;--r:' + Math.floor(Math.random() * 1080) + 'deg';
      fx.append(e);
    }
    setTimeout(() => fx.replaceChildren(), 7000);
  }

  /* ---------- Screens, settings and buttons ---------- */

  const home = $('#home');
  const app = $('.app');
  const settingsBox = $('#settings');

  function homeInfo() {
    $('#homeInfo').textContent = data.done
      ? 'All 100 levels complete · ' + data.stars + ' stars'
      : 'Level ' + data.level + ' of 100 · ' + data.stars + ' stars';
    $('#play').textContent = data.done ? 'View trophy' : (data.level > 1 || data.stars > 0 ? 'Continue' : 'Play');
  }

  function showHome() {
    clearInterval(g.timer);
    g = { moves: 0, p: { cols: 4 } }; // cancels any pending steps of the old level
    fx.replaceChildren();
    $('#overlay').hidden = true;
    app.hidden = true;
    home.hidden = false;
    homeInfo();
    $('#play').focus();
  }

  function showGame() {
    home.hidden = true;
    app.hidden = false;
    if (data.done) { updateHud(); trophy(); } else startLevel();
  }

  function openSettings() {
    $('#optSfx').checked = settings.sfx;
    $('#optMusic').checked = settings.music;
    $('#optVol').value = settings.vol;
    settingsBox.hidden = false;
    $('#closeSettings').focus();
  }
  function closeSettings() { settingsBox.hidden = true; }

  $('#play').addEventListener('click', () => { audio(); play('tap'); startMusic(); showGame(); });
  $('#restart').addEventListener('click', () => { play('tap'); startLevel(); });
  $('#menu').addEventListener('click', () => { play('tap'); showHome(); });
  $('#openSettings').addEventListener('click', () => { play('tap'); openSettings(); });
  $('#gameSettings').addEventListener('click', () => { play('tap'); openSettings(); });
  $('#closeSettings').addEventListener('click', () => { play('tap'); closeSettings(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !settingsBox.hidden) closeSettings(); });

  $('#optSfx').addEventListener('change', (e) => { settings.sfx = e.target.checked; saveSettings(); play('tap'); });
  $('#optMusic').addEventListener('change', (e) => {
    settings.music = e.target.checked;
    saveSettings();
    if (settings.music) startMusic(); else stopMusic();
  });
  $('#optVol').addEventListener('input', (e) => {
    settings.vol = Number(e.target.value);
    if (master) master.gain.value = settings.vol / 100;
  });
  $('#optVol').addEventListener('change', () => { saveSettings(); play('tap'); });

  $('#optReset').addEventListener('click', () => {
    if (confirm('Reset all progress and start again from level 1?')) {
      data = fresh();
      save();
      closeSettings();
      if (app.hidden) homeInfo(); else startLevel();
    }
  });

  // The game opens on the title screen
  homeInfo();
})();