// Pitwall 3D background: perspective grid floor, the selected circuit with real elevation, and the replayed car.
// Plain canvas 2D with a hand-rolled perspective projection; no dependencies. Reads the replay state from motion.js.
(() => {
  const canvas = document.getElementById('scene-bg');
  if (!canvas || !canvas.getContext || !window.PitwallMotion) return;
  const ctx = canvas.getContext('2d');
  const reduce = window.PitwallMotion.reduce;
  const state = window.PitwallMotion.state;
  const ELEVATION = 3.2;      // vertical exaggeration so elevation changes read at background scale
  const GRID = 48, GRID_SPAN = 14, NEAR = 40;
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = k => 1 - Math.pow(1 - k, 3);

  let w = 0, h = 0, dpr = 1, F = 1, D = 430, cx = 0, cy = 0;
  let yaw = .65, pitch = .52, mouseX = 0, mouseY = 0, aimX = 0, aimY = 0;
  let trackAlpha = .85, model = null, previous = null, morph = 1, lastReplay = null, lastTime = 0;
  let cosY = 1, sinY = 0, cosP = 1, sinP = 0;

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, innerWidth < 700 ? 1.25 : 1.5);
    w = innerWidth; h = innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    F = Math.min(w, h * 1.4) * .52; D = 430; cx = w * (w < 700 ? .5 : .44); cy = h * (w < 700 ? .9 : .62);
    trackAlpha = w < 700 ? .55 : .85; // on phones the hero map sits mid-screen, so the 3D circuit stays low and soft
    if (reduce) draw();
  }

  // Camera: orbit (yaw) around the vertical axis, then tilt down (pitch). Returns camera-space [x, y, depth].
  function toCamera(X, Y, Z) {
    const x = X * cosY - Z * sinY, z = X * sinY + Z * cosY;
    return [x, Y * cosP + z * sinP, z * cosP - Y * sinP + D];
  }
  const toScreen = ([x, y, d]) => [cx + x * F / d, cy - y * F / d, d];
  function project(X, Y, Z) {const c = toCamera(X, Y, Z); return c[2] < NEAR ? null : toScreen(c);}
  // Segment clipped against the near plane.
  function segment(a, b) {
    let p = toCamera(...a), q = toCamera(...b);
    if (p[2] < NEAR && q[2] < NEAR) return null;
    if (p[2] < NEAR || q[2] < NEAR) {
      const k = (NEAR - p[2]) / (q[2] - p[2]), cut = [lerp(p[0], q[0], k), lerp(p[1], q[1], k), NEAR];
      if (p[2] < NEAR) p = cut; else q = cut;
    }
    return [toScreen(p), toScreen(q)];
  }

  function buildModel(replay) {
    const pts = replay.track, mx = pts.reduce((s, p) => s + p[1], 0) / pts.length, mz = pts.reduce((s, p) => s + p[2], 0) / pts.length;
    return {replay, colour: replay.colour || '#d7ff62', points: pts.map(p => [p[0], p[1] - mx, (p[3] || 0) * ELEVATION, p[2] - mz])};
  }
  function carAt(m, f) {
    const pts = m.points; let i = 0;
    while (i < pts.length - 2 && pts[i + 1][0] <= f) i++;
    const a = pts[i], b = pts[i + 1], k = b[0] > a[0] ? Math.min(1, Math.max(0, (f - a[0]) / (b[0] - a[0]))) : 0;
    return {i, X: lerp(a[1], b[1], k), Y: lerp(a[2], b[2], k), Z: lerp(a[3], b[3], k)};
  }

  /* Drifting motes give the volume some depth. */
  const motes = Array.from({length: innerWidth < 700 ? 40 : 80}, () => ({x: (Math.random() - .5) * 1400, y: Math.random() * 260 + 10, z: (Math.random() - .5) * 1400, s: Math.random() * .6 + .4}));

  function drawSky() {
    const horizon = cy - F * Math.tan(pitch);
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#090c0f'); sky.addColorStop(clamp01((horizon - 40) / h), '#0d1316'); sky.addColorStop(clamp01(horizon / h), '#122019'); sky.addColorStop(1, '#0a0e11');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(cx, horizon, 0, cx, horizon, w * .55);
    glow.addColorStop(0, 'rgba(215,255,98,.07)'); glow.addColorStop(1, 'rgba(215,255,98,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
  }
  function clamp01(v) {return Math.min(.999, Math.max(.001, v));}

  function drawGrid(time) {
    const span = GRID * GRID_SPAN, drift = reduce ? 0 : (time * .012) % GRID; // the floor slides slowly toward the viewer
    ctx.lineWidth = 1;
    for (let axis = 0; axis < 2; axis++)
      for (let k = -GRID_SPAN; k <= GRID_SPAN; k++) {
        const c = k * GRID + (axis ? drift : 0);
        for (let s = 0; s < 8; s++) {
          const t0 = -span + (2 * span) * s / 8, t1 = -span + (2 * span) * (s + 1) / 8;
          const seg = axis ? segment([t0, 0, c], [t1, 0, c]) : segment([c, 0, t0], [c, 0, t1]);
          if (!seg) continue;
          const depth = (seg[0][2] + seg[1][2]) / 2, fade = Math.max(0, 1 - (depth - 250) / 1300) * Math.min(1, (span - Math.abs(c)) / (GRID * 3));
          if (fade <= 0) continue;
          ctx.strokeStyle = `rgba(120,140,150,${(.16 * fade).toFixed(3)})`;
          ctx.beginPath(); ctx.moveTo(seg[0][0], seg[0][1]); ctx.lineTo(seg[1][0], seg[1][1]); ctx.stroke();
        }
      }
  }

  function polyline(points, map, style, width) {
    ctx.beginPath(); let open = false;
    for (const p of points) {
      const s = map(p);
      if (!s) {open = false; continue;}
      open ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); open = true;
    }
    ctx.strokeStyle = style; ctx.lineWidth = width; ctx.stroke();
  }

  function drawTrack(m, alpha, rise) {
    if (!m || alpha <= 0) return;
    const pts = m.points, lift = p => p[2] * rise;
    ctx.save(); ctx.globalAlpha = alpha; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    polyline(pts, p => project(p[1], 0, p[3]), 'rgba(0,0,0,.45)', 14);                                   // shadow on the floor
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(215,255,98,.10)';                                         // elevation curtains
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 3) {
      const p = pts[i]; if (lift(p) < 1.5) continue;
      const a = project(p[1], 0, p[3]), b = project(p[1], lift(p), p[3]);
      if (a && b) {ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);}
    }
    ctx.stroke();
    polyline(pts, p => project(p[1], lift(p), p[3]), 'rgba(29,38,45,.95)', 9);                          // asphalt
    polyline(pts, p => project(p[1], lift(p), p[3]), 'rgba(215,255,98,.42)', 1.4);                      // racing line
    const closing = [pts[pts.length - 1], pts[0]];
    polyline(closing, p => project(p[1], lift(p), p[3]), 'rgba(215,255,98,.42)', 1.4);
    if (m.replay === state.replay && rise >= 1) {
      const car = carAt(m, state.f), from = Math.max(0, car.i - Math.round(pts.length * .07));
      const trail = pts.slice(from, car.i + 1).concat([[0, car.X, car.Y, car.Z]]);
      polyline(trail, p => project(p[1], p[2], p[3]), hexA(m.colour, .7), 3.5);
      const s = project(car.X, car.Y, car.Z), g = project(car.X, 0, car.Z);
      if (s) {
        if (g) {ctx.strokeStyle = hexA(m.colour, .35); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(g[0], g[1]); ctx.stroke();}
        const r = Math.max(2.2, 2200 / s[2]);
        const halo = ctx.createRadialGradient(s[0], s[1], 0, s[0], s[1], r * 6);
        halo.addColorStop(0, hexA(m.colour, .55)); halo.addColorStop(1, hexA(m.colour, 0));
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(s[0], s[1], r * 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = m.colour; ctx.beginPath(); ctx.arc(s[0], s[1], r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }
  function hexA(hex, a) {
    const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
    return Number.isNaN(n) ? `rgba(215,255,98,${a})` : `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
  }

  function drawMotes(dt) {
    for (const m of motes) {
      if (!reduce) {m.z -= dt * .02 * m.s; if (m.z < -700) m.z += 1400;}
      const s = project(m.x, m.y, m.z); if (!s) continue;
      const a = Math.max(0, .5 - s[2] / 2400) * m.s;
      ctx.fillStyle = `rgba(215,255,98,${a.toFixed(3)})`; ctx.fillRect(s[0], s[1], 1.6, 1.6);
    }
  }

  function draw(now = 0) {
    const dt = lastTime ? Math.min(now - lastTime, 50) : 16; lastTime = now;
    if (state.replay !== lastReplay) {
      lastReplay = state.replay;
      if (state.replay && state.replay.track) {previous = model; model = buildModel(state.replay); morph = reduce || !previous ? 1 : 0;}
    }
    if (morph < 1) morph = Math.min(1, morph + dt / 1400);
    // Scroll tilts the camera down toward a plan view and dims the scene behind the content.
    const scroll = Math.min(1, scrollY / Math.max(1, innerHeight));
    if (!reduce) {yaw += dt * .00005; mouseX = lerp(mouseX, aimX, .04); mouseY = lerp(mouseY, aimY, .04);}
    pitch = .5 + scroll * .4 + mouseY * .05;
    const view = yaw + mouseX * .12;
    cosY = Math.cos(view); sinY = Math.sin(view); cosP = Math.cos(pitch); sinP = Math.sin(pitch);
    ctx.globalAlpha = 1; drawSky();
    ctx.globalAlpha = 1 - scroll * .45;
    drawGrid(now); drawMotes(dt);
    const k = ease(morph);
    drawTrack(previous && morph < 1 ? previous : null, (1 - k) * trackAlpha, 1 - k);
    drawTrack(model, (previous ? k : 1) * trackAlpha, k);
    ctx.globalAlpha = 1;
  }

  addEventListener('resize', resize, {passive: true});
  addEventListener('pointermove', e => {aimX = e.clientX / innerWidth * 2 - 1; aimY = e.clientY / innerHeight * 2 - 1;}, {passive: true});
  resize();
  if (reduce) {
    // Static scene: redraw when the replay arrives or changes, and on scroll for the tilt.
    addEventListener('scroll', () => draw(), {passive: true});
    setInterval(() => {if (state.replay !== lastReplay) draw();}, 500);
    draw();
  } else {
    const loop = now => {draw(now); requestAnimationFrame(loop);};
    requestAnimationFrame(loop);
  }
})();
