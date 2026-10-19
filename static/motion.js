// Pitwall motion layer. Dependency-free; every effect is skipped or rendered static under prefers-reduced-motion.
(() => {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const PLAYBACK = 4;           // replay runs at 4× real time
  const LIGHT_GAP = 1000;       // F1 start lights come on at one-second intervals

  // Quasi-steady-state lap speed: cap each sample at its corner limit, then apply
  // a forward acceleration pass and a backward braking pass around the closed lap.
  function lapSpeeds(limits, accel, brake) {
    const n = limits.length, v = limits.slice();
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < n; i++) {const p = v[(i - 1 + n) % n]; v[i] = Math.min(limits[i], p + accel * (1 - p * .65));}
    for (let pass = 0; pass < 2; pass++)
      for (let i = n - 1; i >= 0; i--) v[i] = Math.min(v[i], v[(i + 1) % n] + brake);
    return v;
  }
  // Index of the last row whose first column is <= f (rows sorted by column 0).
  function seek(rows, f) {
    let lo = 0, hi = rows.length - 1;
    if (f <= rows[0][0]) return 0;
    while (hi - lo > 1) {const mid = (lo + hi) >> 1; if (rows[mid][0] <= f) lo = mid; else hi = mid;}
    return rows[hi][0] <= f ? hi : lo;
  }

  /* Simulated replay used when a race has no OpenF1 replay (offline demo data). Same shape as the API. */
  const FALLBACK_D = 'M60,200 C60,150 90,120 140,118 L250,112 C290,110 300,80 330,62 C360,44 410,50 420,85 C430,120 400,140 360,150 L300,165 C270,172 265,200 290,215 L380,228 C410,232 415,255 390,262 L120,262 C80,262 60,240 60,200 Z';
  function simulatedReplay() {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', FALLBACK_D);
    const L = path.getTotalLength(), N = 240, ds = L / N;
    const pts = Array.from({length: N + 1}, (_, i) => path.getPointAtLength(Math.min(L, i * ds)));
    const heading = pts.map((p, i) => {const q = pts[Math.min(N, i + 1)]; return Math.atan2(q.y - p.y, q.x - p.x);});
    const curv = heading.map((h, i) => {let d = heading[(i + 1) % N] - h; d = Math.atan2(Math.sin(d), Math.cos(d)); return Math.abs(d) / ds;});
    const v = lapSpeeds(curv.slice(0, N).map(c => clamp(Math.sqrt(.0045 / Math.max(c, 1e-5)), .22, 1)), .03, .07);
    const t = [0]; for (let i = 0; i < N; i++) t.push(t[i] + ds / v[i]);
    const total = t[N], f = i => +(t[i] / total).toFixed(4), splitAt = d => f(Math.round(d / ds));
    return {
      simulated: true, circuit: 'Demo circuit', driver: 'SIM', name: 'Simulated lap', team: 'Demo data', colour: '#d7ff62', lap: '—', time: 88.112,
      sectors: [29.104, 31.22, 27.788], sector_colours: ['green', 'purple', 'yellow'], splits: [splitAt(L * .34), splitAt(L * .69)],
      track: pts.map((p, i) => [f(i), +p.x.toFixed(1), +p.y.toFixed(1)]),
      telemetry: v.map((s, i) => {const d = s - v[(i - 1 + N) % N]; return [f(i), Math.round(80 + s * 240), d > .001 ? 100 : d < -.001 ? 0 : 45, d < -.001 ? 1 : 0, clamp(Math.round(1 + s * 7), 1, 8)];}),
    };
  }

  /* Header glass, scroll progress fallback and hero parallax */
  const header = document.querySelector('header');
  const progress = document.querySelector('.scroll-progress');
  const hero = document.querySelector('.hero');
  const heroCopy = hero && hero.firstElementChild, heroArt = document.querySelector('.hero-art');
  const scrollTimeline = CSS.supports('animation-timeline: scroll()');
  let ticking = false;
  function onScroll() {
    ticking = false;
    header.classList.toggle('scrolled', scrollY > 12);
    if (progress && !scrollTimeline) {const max = root.scrollHeight - innerHeight; progress.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;}
    if (hero && !reduce && scrollY < innerHeight * 1.2) {
      const y = scrollY;
      heroCopy.style.transform = `translate3d(0, ${y * .18}px, 0)`; heroCopy.style.opacity = clamp(1 - y / 520, 0, 1);
      heroArt.style.transform = `translate3d(0, ${y * .08}px, 0)`;
    }
  }
  addEventListener('scroll', () => {if (!ticking) {ticking = true; requestAnimationFrame(onScroll);}}, {passive: true});
  onScroll();

  /* Scroll reveals, with children of [data-reveal-stagger] cascading in */
  const revealer = 'IntersectionObserver' in window && !reduce ? new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) {e.target.classList.add('in'); revealer.unobserve(e.target);}
  }, {rootMargin: '0px 0px -10% 0px'}) : null;
  function reveal(node) {if (revealer) revealer.observe(node); else node.classList.add('in');}
  document.querySelectorAll('[data-reveal-stagger]').forEach(group => [...group.children].forEach((child, i) => child.style.setProperty('--stagger', `${i * 110}ms`)));
  document.querySelectorAll('[data-reveal]').forEach(reveal);
  const metricWatcher = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const e of entries) e.target.classList.toggle('in-view', e.isIntersecting);
  }, {threshold: .6}) : null;

  /* Cursor spotlight on surfaces */
  if (!reduce && matchMedia('(hover: hover)').matches) {
    document.addEventListener('pointermove', e => {
      const surface = e.target.closest && e.target.closest('.panel, .metric, .selectors, .saved-grid > a');
      if (!surface) return;
      const r = surface.getBoundingClientRect();
      surface.style.setProperty('--mx', `${e.clientX - r.left}px`); surface.style.setProperty('--my', `${e.clientY - r.top}px`);
    }, {passive: true});
  }

  /* Fastest-lap replay engine for the hero circuit */
  const svg = document.querySelector('.circuit');
  const replays = new Map();
  const state = {replay: null, f: 0, running: false};
  let engine = null;
  function loadReplay(id) {
    if (!replays.has(id)) replays.set(id, (id ? fetch(`/api/races/${id}/replay/`).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null)).then(data => data && data.track && data.track.length > 10 ? data : simulatedReplay()));
    return replays.get(id);
  }
  function trackPath(replay) {return 'M' + replay.track.map(([, x, y]) => `${x},${y}`).join(' L') + ' Z';}

  if (svg) {
    const ns = 'http://www.w3.org/2000/svg';
    const path = svg.querySelector('#circuit-path');
    const base = svg.querySelector('.circuit-base'), edge = svg.querySelector('.circuit-edge');
    const sectors = [...svg.querySelectorAll('.circuit-sector')], trail = svg.querySelector('.circuit-trail');
    const car = svg.querySelector('.car'), startLine = svg.querySelector('.start-line'), tags = [...svg.querySelectorAll('.sector-tag')];
    const $ = sel => document.querySelector(sel);
    const ui = {circuit: $('[data-replay-circuit]'), mode: $('[data-replay-mode]'), driver: $('[data-driver]'), team: $('[data-driver-team]'), time: $('[data-lap-time]'),
      speed: $('[data-speed]'), gear: $('[data-gear]'), throttle: $('[data-throttle]'), brake: $('[data-brake]'), sectors: [...document.querySelectorAll('[data-sector-time]')], source: $('[data-replay-source]')};
    const fmt = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}`;
    let replay, dist, L, sectorDone, elapsed = 0, last = null, hold = 0, released = false, token = 0;

    function positionAt(f) {
      const pts = replay.track, i = seek(pts, f), j = Math.min(pts.length - 1, i + 1);
      const span = pts[j][0] - pts[i][0], k = span > 0 ? clamp((f - pts[i][0]) / span, 0, 1) : 0;
      return {x: pts[i][1] + (pts[j][1] - pts[i][1]) * k, y: pts[i][2] + (pts[j][2] - pts[i][2]) * k, d: dist[i] + (dist[j] - dist[i]) * k};
    }
    function resetLap() {
      sectorDone = 0;
      sectors.forEach(s => s.classList.add('fade'));
      ui.sectors.forEach((el, i) => {el.className = ''; el.querySelector('b').textContent = '--.---';});
    }
    function completeSector(i) {
      const cls = replay.sector_colours[i] || 'green';
      sectors[i].classList.remove('purple', 'green', 'yellow', 'fade'); sectors[i].classList.add(cls);
      if (ui.sectors[i]) {ui.sectors[i].className = cls; ui.sectors[i].querySelector('b').textContent = replay.sectors[i].toFixed(3);}
    }
    function render(f) {
      state.f = f;
      const p = positionAt(f);
      car.setAttribute('cx', p.x.toFixed(1)); car.setAttribute('cy', p.y.toFixed(1));
      const trailLen = Math.min(80, p.d);
      trail.style.strokeDasharray = `${trailLen} ${L * 2}`; trail.style.strokeDashoffset = trailLen - p.d;
      const splits = [...replay.splits, 1];
      while (sectorDone < 3 && f >= splits[sectorDone]) completeSector(sectorDone++);
      if (ui.time) ui.time.textContent = fmt(f * replay.time);
      const tel = replay.telemetry.length ? replay.telemetry[seek(replay.telemetry, f)] : null;
      if (tel) {
        if (ui.speed) ui.speed.textContent = tel[1];
        if (ui.gear) ui.gear.textContent = tel[4] || 'N';
        if (ui.throttle) ui.throttle.style.transform = `scaleX(${tel[2] / 100})`;
        if (ui.brake) ui.brake.style.transform = `scaleX(${tel[3]})`;
      }
    }
    function apply(data, animate) {
      replay = data; state.replay = data;
      path.setAttribute('d', trackPath(data));
      dist = [0]; for (let i = 1; i < data.track.length; i++) dist.push(dist[i - 1] + Math.hypot(data.track[i][1] - data.track[i - 1][1], data.track[i][2] - data.track[i - 1][2]));
      L = path.getTotalLength();
      const bounds = [0, positionAt(data.splits[0]).d, positionAt(data.splits[1]).d, dist[dist.length - 1]];
      sectors.forEach((s, i) => {s.style.strokeDasharray = `${Math.max(0, bounds[i + 1] - bounds[i])} ${L * 2}`; s.style.strokeDashoffset = -bounds[i];});
      tags.forEach((tag, i) => {
        const mid = (bounds[i] + bounds[i + 1]) / 2, k = clamp(dist.findIndex(d => d >= mid), 1, data.track.length - 1);
        const a = data.track[k - 1], b = data.track[k], ang = Math.atan2(b[2] - a[2], b[1] - a[1]);
        tag.setAttribute('x', (b[1] + Math.sin(ang) * 20).toFixed(1)); tag.setAttribute('y', (b[2] - Math.cos(ang) * 20 + 4).toFixed(1));
      });
      const [s0, s1] = [data.track[0], data.track[Math.min(3, data.track.length - 1)]], ang = Math.atan2(s1[2] - s0[2], s1[1] - s0[1]);
      startLine.setAttribute('x1', (s0[1] + Math.sin(ang) * 11).toFixed(1)); startLine.setAttribute('y1', (s0[2] - Math.cos(ang) * 11).toFixed(1));
      startLine.setAttribute('x2', (s0[1] - Math.sin(ang) * 11).toFixed(1)); startLine.setAttribute('y2', (s0[2] + Math.cos(ang) * 11).toFixed(1));
      car.style.fill = data.colour; car.style.color = data.colour; trail.style.stroke = data.colour;
      if (ui.circuit) ui.circuit.textContent = data.circuit.toUpperCase();
      if (ui.mode) ui.mode.textContent = data.simulated ? 'SIMULATED DEMO LAP' : `FASTEST LAP REPLAY ×${PLAYBACK}`;
      if (ui.driver) {ui.driver.textContent = data.driver; ui.driver.style.setProperty('--team', data.colour);}
      if (ui.team) ui.team.textContent = data.simulated ? data.team : `${data.name} · ${data.team} · LAP ${data.lap}`;
      if (ui.source) ui.source.textContent = data.simulated ? 'SIMULATED · NOT REAL TIMING' : '2025 RACE DATA · OPENF1 (UNOFFICIAL)';
      resetLap(); elapsed = 0; hold = 0;
      if (reduce) {render(.55); [0, 1, 2].forEach(completeSector); if (ui.time) ui.time.textContent = fmt(replay.time); return;}
      render(0);
      if (animate) [base, edge].forEach(p => p.animate([{strokeDasharray: `${L} ${L}`, strokeDashoffset: L}, {strokeDasharray: `${L} ${L}`, strokeDashoffset: 0}], {duration: 2200, easing: 'cubic-bezier(.65,0,.35,1)'}));
    }
    function frame(now) {
      if (last === null) last = now;
      const dt = Math.min(now - last, 50); last = now; // clamp so a backgrounded tab does not jump
      if (replay && released) {
        if (hold > 0) {hold -= dt; if (hold <= 0) {resetLap(); elapsed = 0;}}
        else {
          elapsed += dt;
          const f = Math.min(1, elapsed * PLAYBACK / (replay.time * 1000));
          render(f);
          if (f >= 1) hold = 2200; // show the completed lap before the next one starts
        }
      }
      requestAnimationFrame(frame);
    }
    engine = {
      async show(id, animate) {
        const mine = ++token, data = await loadReplay(id);
        if (mine !== token) return;
        if (replay && !reduce) {
          heroArt.classList.add('switching');
          await new Promise(r => setTimeout(r, 450));
          if (mine !== token) return;
          apply(data, true);
          heroArt.classList.remove('switching');
        } else apply(data, animate);

      },
      release() {released = true;},
    };
    if (!reduce) requestAnimationFrame(frame);
  }
  function miniMaps(id, data) {
    document.querySelectorAll('[data-mini-track]').forEach(mini => {
      if (mini.dataset.raceId !== String(id)) return;
      const p = mini.querySelector('path'); p.setAttribute('d', trackPath(data));
      if (!reduce) {const len = p.getTotalLength(); p.animate([{strokeDasharray: `${len} ${len}`, strokeDashoffset: len}, {strokeDasharray: `${len} ${len}`, strokeDashoffset: 0}], {duration: 1800, easing: 'cubic-bezier(.65,0,.35,1)'});}
    });
  }

  /* Start lights: every visit. Five lights at one-second intervals, a short random hold, then lights out releases the car. */
  if (hero) {
    hero.classList.add('go');
    const lights = [...hero.querySelectorAll('.start-lights i')];
    const release = () => engine && engine.release();
    if (reduce || !lights.length) release();
    else {
      lights.forEach((light, i) => setTimeout(() => light.classList.add('on'), 700 + i * LIGHT_GAP));
      setTimeout(() => {lights[0].parentElement.classList.add('out'); lights.forEach(l => l.classList.remove('on')); hero.classList.add('lights-out'); release();},
        700 + 4 * LIGHT_GAP + 1200 + Math.random() * 1300);
    }
  }

  /* Background telemetry: the replayed lap's speed, throttle and brake traces behind the hero, synced to the car. */
  const canvas = document.getElementById('telemetry-bg');
  if (canvas && canvas.getContext && hero) {
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, dpr = 1, lastFrame = 0;
    function resize() {dpr = Math.min(devicePixelRatio || 1, 1.5); w = innerWidth; h = innerHeight; canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();}
    function trace(rows, col, max, top, height, color, fill) {
      ctx.beginPath();
      rows.forEach((row, k) => {const x = row[0] * w, y = top + height - (row[col] / max) * height; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);});
      ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.stroke();
      if (fill) {ctx.lineTo(w, top + height); ctx.lineTo(0, top + height); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();}
    }
    function draw() {
      ctx.clearRect(0, 0, w, h);
      const replay = state.replay, rect = hero.getBoundingClientRect();
      const fade = clamp(rect.bottom / Math.max(1, rect.height), 0, 1);
      if (!replay || !replay.telemetry.length || fade <= 0) return;
      ctx.globalAlpha = fade;
      // Drawn in the strip reserved by .hero's bottom padding, below the headline and timing board.
      const bottom = rect.bottom - 14, speedH = 78, top = bottom - speedH - 64;
      const rows = replay.telemetry, maxSpeed = Math.max(...rows.map(r => r[1]), 300);
      ctx.font = '9px monospace'; ctx.fillStyle = 'rgba(161,173,183,.38)';
      ctx.fillText('SPEED', 18, top - 6); ctx.fillText('THROTTLE', 18, top + speedH + 14); ctx.fillText('BRAKE', 18, top + speedH + 46);
      ctx.strokeStyle = 'rgba(43,52,60,.6)'; ctx.lineWidth = 1; ctx.beginPath();
      for (const y of [top, top + speedH, top + speedH + 18, top + speedH + 40, top + speedH + 50, top + speedH + 62]) {ctx.moveTo(0, y); ctx.lineTo(w, y);}
      ctx.stroke();
      const grad = ctx.createLinearGradient(0, top, 0, top + speedH); grad.addColorStop(0, 'rgba(215,255,98,.10)'); grad.addColorStop(1, 'rgba(215,255,98,0)');
      trace(rows, 1, maxSpeed, top, speedH, 'rgba(215,255,98,.38)', grad);
      trace(rows, 2, 100, top + speedH + 18, 22, 'rgba(97,190,255,.34)');
      trace(rows, 3, 1, top + speedH + 50, 12, 'rgba(255,69,69,.4)');
      if (!reduce) {
        const px = state.f * w, row = rows[seek(rows, state.f)];
        ctx.strokeStyle = 'rgba(215,255,98,.45)'; ctx.beginPath(); ctx.moveTo(px, top - 16); ctx.lineTo(px, top + speedH + 62); ctx.stroke();
        ctx.fillStyle = 'rgba(215,255,98,.75)'; ctx.font = '10px monospace';
        ctx.fillText(`${row[1]} KM/H · G${row[4] || 'N'}`, px + 6 + (px > w - 140 ? -130 : 0), top - 6);
      }
      ctx.globalAlpha = 1;
    }
    function loop(now) {if (now - lastFrame >= 33) {lastFrame = now; draw();} requestAnimationFrame(loop);}
    addEventListener('resize', resize, {passive: true});
    resize();
    if (reduce) addEventListener('scroll', draw, {passive: true});
    else requestAnimationFrame(loop);
  }

  /* Hooks used by app.js when the race selection and comparison results change. */
  function countUp(el) {
    const match = /^(\d+\.\d{3}) s$/.exec(el.textContent);
    if (!match || reduce) return;
    const target = parseFloat(match[1]), from = target * .94, t0 = performance.now();
    const tick = now => {
      const p = Math.min(1, (now - t0) / 1600), eased = 1 - Math.pow(1 - p, 4);
      el.textContent = `${(p < 1 ? from + (target - from) * eased : target).toFixed(3)} s`;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  window.PitwallMotion = {
    reduce,
    state,
    reveal,
    showRace(id, animate = true) {if (engine) engine.show(id, animate); else loadReplay(id).then(data => miniMaps(id, data));},
    miniMap(id) {loadReplay(id).then(data => miniMaps(id, data));},
    results(container, colors) {
      container.classList.remove('entering'); void container.offsetWidth; container.classList.add('entering');
      container.querySelectorAll('.metric').forEach((m, i) => {
        m.style.setProperty('--i', i); if (colors[i]) m.style.setProperty('--accent', colors[i]);
        countUp(m.querySelector('strong')); if (metricWatcher) metricWatcher.observe(m);
      });
      container.querySelectorAll('.stint-row').forEach((row, r) => row.querySelectorAll('.stint').forEach((s, i) => s.style.setProperty('--d', `${.25 + r * .18 + i * .22}s`)));
    },
    chart(container) {
      if (reduce) return;
      const chartSvg = container.querySelector('svg'); if (!chartSvg) return;
      container.classList.remove('enter'); void container.offsetWidth; container.classList.add('enter');
      chartSvg.querySelectorAll('path').forEach((p, i) => {
        const len = p.getTotalLength();
        p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
        p.animate([{strokeDashoffset: len}, {strokeDashoffset: 0}], {duration: 2400, delay: i * 200, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards'})
          .finished.then(() => {p.style.strokeDasharray = ''; p.style.strokeDashoffset = '';}).catch(() => {});
      });
      const width = chartSvg.viewBox.baseVal.width || 1;
      chartSvg.querySelectorAll('circle').forEach(c => c.style.setProperty('--d', `${(c.cx.baseVal.value / width) * 2.2 + .2}s`));
    },
  };
})();
