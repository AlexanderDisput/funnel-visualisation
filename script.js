/* ============================================================
   Recruiting Funnel — stylized particle visualization
   Pure canvas, no dependencies. Indeed-themed.

   Model:
     - Budget & Visibility  -> funnel MOUTH width (how many get caught)
     - Employer Branding    -> HOLE size in the funnel slopes
                               (how many leak out before applying)
     - Candidate Volume     -> spawn rate
   Candidates pack in the bottom bins with light collision physics.
   ============================================================ */

(() => {
  "use strict";

  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d");

  const COLORS = {
    funnelStroke: "#2557a7",
    funnelFill: "rgba(37, 87, 167, 0.07)",
    holeEdge: "#9fb4d6",
    glassStroke: "#2557a7",
    glassFill: "rgba(37, 87, 167, 0.05)",
    lostStroke: "#b9c4d6",
    lostFill: "rgba(138, 160, 196, 0.08)",
    nrStroke: "#d2d9e6",
    nrFill: "rgba(138, 160, 196, 0.045)",
    standard: "#8aa0c4",
    standardCore: "#6b82ab",
    quality: "#e03131",
    label: "#8698b7",
    ghostLine: "rgba(37, 87, 167, 0.6)",
  };

  const PARTICLE_R = 4.4;

  const sliders = {
    funnel: document.getElementById("funnel"),
    branding: document.getElementById("branding"),
    volume: document.getElementById("volume"),
  };
  const values = {
    funnel: document.getElementById("funnelVal"),
    branding: document.getElementById("brandingVal"),
    volume: document.getElementById("volumeVal"),
  };
  const btnPause = document.getElementById("pause");
  const btnReset = document.getElementById("reset");
  const btnCompare = document.getElementById("compare");
  const presetBtns = Array.from(document.querySelectorAll(".chip"));

  const PRESETS = {
    weak: { funnel: 24, branding: 18, volume: 52 },
    balanced: { funnel: 55, branding: 60, volume: 55 },
    strong: { funnel: 86, branding: 90, volume: 80 },
  };

  let W = 0, H = 0, dpr = 1;
  let paused = false;
  let comparing = false;

  const geo = {
    centerX: 0,
    funnelTopY: 0, collarY: 0, outletY: 0, stemBottomY: 0,
    collarHalf: 0, outletHalf: 0,
    mouthHalf: 0, mouthHalfTarget: 0,
    holeY: 0,
    holeTHalf: 0, holeTHalfTarget: 0, // half-extent of the hole along the slope (param)
    pLeakStd: 0.4, pLeakQual: 0.6,
  };

  const bins = {};
  let binList = [];
  const particles = []; // in transit
  let spawnAcc = 0;
  let bodyAge = 0;

  // ---------- Setup ----------
  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(320, rect.width);
    H = Math.max(360, rect.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    computeGeometry(true);
  }

  function makeBin(cfg) {
    return {
      cx: cfg.cx, top: cfg.top, bottom: cfg.bottom,
      left: cfg.left, right: cfg.right, half: cfg.half,
      bodies: [], max: cfg.max, markLevelY: null,
      stroke: cfg.stroke, fill: cfg.fill, label: cfg.label,
    };
  }

  function computeGeometry(snap) {
    geo.centerX = W / 2;
    geo.funnelTopY = H * 0.12;
    geo.collarY = H * 0.34;
    geo.outletY = H * 0.52;
    geo.stemBottomY = H * 0.60;
    geo.collarHalf = Math.max(40, W * 0.075);
    geo.outletHalf = Math.max(16, W * 0.03);
    geo.holeY = geo.collarY + (geo.outletY - geo.collarY) * 0.5;

    const f = sliders.funnel.value / 100;
    const b = sliders.branding.value / 100;
    const openness = 1 - b; // weak brand -> wide holes, more leaks

    geo.mouthHalfTarget = W * (0.12 + 0.33 * f);
    geo.holeTHalfTarget = 0.06 + 0.34 * openness;        // hole size along the slope
    geo.pLeakStd = Math.max(0, Math.min(1, 0.75 - 0.68 * b));
    geo.pLeakQual = Math.max(0, Math.min(1, 0.92 - 0.9 * b * b)); // reds walk first

    if (snap || geo.mouthHalf === 0) {
      geo.mouthHalf = geo.mouthHalfTarget;
      geo.holeTHalf = geo.holeTHalfTarget;
    }
    if (snap || binList.length === 0) buildBins();
  }

  function buildBins() {
    const C = geo.centerX;
    const mainHalf = Math.min(W * 0.14, 175);
    const lostHalf = Math.min(W * 0.085, 105);
    const nrHalf = Math.min(W * 0.07, 90);
    const gap = Math.max(W * 0.012, 10);
    const lostOffset = mainHalf + gap + lostHalf;
    const nrOffset = mainHalf + gap + 2 * lostHalf + gap + nrHalf;
    const bottom = H * 0.955;
    const inset = 7;

    bins.main = makeBin({
      cx: C, half: mainHalf, left: C - mainHalf + inset, right: C + mainHalf - inset,
      top: H * 0.64, bottom, max: 150,
      stroke: COLORS.glassStroke, fill: COLORS.glassFill, label: "APPLICATIONS",
    });
    bins.lostL = makeBin({
      cx: C - lostOffset, half: lostHalf,
      left: C - lostOffset - lostHalf + inset, right: C - lostOffset + lostHalf - inset,
      top: H * 0.74, bottom, max: 70,
      stroke: COLORS.lostStroke, fill: COLORS.lostFill, label: "DROPPED OFF",
    });
    bins.lostR = makeBin({
      cx: C + lostOffset, half: lostHalf,
      left: C + lostOffset - lostHalf + inset, right: C + lostOffset + lostHalf - inset,
      top: H * 0.74, bottom, max: 70,
      stroke: COLORS.lostStroke, fill: COLORS.lostFill, label: "DROPPED OFF",
    });
    bins.nrL = makeBin({
      cx: C - nrOffset, half: nrHalf,
      left: C - nrOffset - nrHalf + inset, right: C - nrOffset + nrHalf - inset,
      top: H * 0.74, bottom, max: 60,
      stroke: COLORS.nrStroke, fill: COLORS.nrFill, label: "NOT REACHED",
    });
    bins.nrR = makeBin({
      cx: C + nrOffset, half: nrHalf,
      left: C + nrOffset - nrHalf + inset, right: C + nrOffset + nrHalf - inset,
      top: H * 0.74, bottom, max: 60,
      stroke: COLORS.nrStroke, fill: COLORS.nrFill, label: "NOT REACHED",
    });
    binList = [bins.nrL, bins.lostL, bins.main, bins.lostR, bins.nrR];
    comparing = false;
    btnCompare.textContent = "Compare";
  }

  // half-width of the funnel channel at a given y
  function funnelHalfAt(y) {
    if (y <= geo.collarY) {
      const t = (y - geo.funnelTopY) / (geo.collarY - geo.funnelTopY);
      return lerp(geo.mouthHalf, geo.collarHalf, clamp01(t));
    }
    const t = (y - geo.collarY) / (geo.outletY - geo.collarY);
    return lerp(geo.collarHalf, geo.outletHalf, clamp01(t));
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp01(t) { return Math.max(0, Math.min(1, t)); }

  // hole span (in y) on the lower slope
  function holeYRange() {
    const span = geo.outletY - geo.collarY;
    const c = 0.5;
    return [geo.collarY + span * (c - geo.holeTHalf), geo.collarY + span * (c + geo.holeTHalf)];
  }

  // ---------- Particles ----------
  function spawnParticle() {
    if (particles.length >= 340) return;
    const spread = W * 0.92;
    particles.push({
      x: geo.centerX + (Math.random() - 0.5) * spread,
      y: -10 - Math.random() * 40,
      vx: (Math.random() - 0.5) * 0.3,
      vy: 1.6 + Math.random() * 1.0,
      quality: Math.random() < 0.17,
      state: "falling",
      classified: false,
      leakRolled: false,
      bin: null, entryX: 0,
      gateX: 0, gateY: 0, side: 0,
    });
  }

  function assignBin(p, bin) {
    p.bin = bin;
    p.entryX = Math.max(bin.left + PARTICLE_R, Math.min(bin.right - PARTICLE_R,
      bin.cx + (Math.random() - 0.5) * bin.half * 1.3));
  }

  function classify(p) {
    p.classified = true;
    if (Math.abs(p.x - geo.centerX) <= geo.mouthHalf) {
      p.state = "infunnel";
    } else {
      assignBin(p, p.x <= geo.centerX ? bins.nrL : bins.nrR);
      p.state = "tosettle";
      p.vx = (p.x <= geo.centerX ? -1 : 1) * (0.8 + Math.random());
    }
  }

  function updateParticle(p, dt) {
    const g = 0.12 * dt;

    switch (p.state) {
      case "falling": {
        p.vy += g; p.y += p.vy * dt; p.x += p.vx * dt;
        if (!p.classified && p.y >= geo.funnelTopY) classify(p);
        break;
      }

      case "infunnel": {
        p.vy += g * 0.7; p.vy = Math.min(p.vy, 6);
        p.y += p.vy * dt;
        const half = funnelHalfAt(p.y);
        const left = geo.centerX - half, right = geo.centerX + half;
        p.vx += (geo.centerX - p.x) * 0.01 * dt; // gentle convergence
        p.vx *= 0.96;
        p.x += p.vx * dt;
        if (p.x < left + PARTICLE_R) { p.x = left + PARTICLE_R; p.vx += 0.35; }
        if (p.x > right - PARTICLE_R) { p.x = right - PARTICLE_R; p.vx -= 0.35; }

        // leak through the holes (employer-branding loss)
        const [hTop] = holeYRange();
        if (!p.leakRolled && p.y >= hTop && p.y > geo.collarY) {
          p.leakRolled = true;
          const pLeak = p.quality ? geo.pLeakQual : geo.pLeakStd;
          if (Math.random() < pLeak) {
            p.side = p.x <= geo.centerX ? -1 : 1;
            p.gateY = geo.holeY;
            p.gateX = geo.centerX + p.side * funnelHalfAt(geo.holeY);
            p.state = "leaking";
            break;
          }
        }
        if (p.y >= geo.outletY) { assignBin(p, bins.main); p.state = "tosettle"; }
        break;
      }

      case "leaking": {
        // move to the gap, then exit outward and fall to the DROPPED OFF bin
        p.x += (p.gateX - p.x) * 0.2 * dt;
        p.y += (p.gateY - p.y) * 0.2 * dt;
        if (Math.abs(p.x - p.gateX) < 4 && Math.abs(p.y - p.gateY) < 6) {
          assignBin(p, p.side < 0 ? bins.lostL : bins.lostR);
          p.state = "tosettle";
          p.vx = p.side * (3.0 + Math.random());
          p.vy = 0.3;
        }
        break;
      }

      case "tosettle": {
        const bin = p.bin;
        // travel outward/toward the bin first, then drop in
        const clearing = Math.abs(p.x - bin.cx) > bin.half;
        p.vy += clearing ? g * 0.35 : g;
        p.x += (p.entryX - p.x) * 0.1 * dt;
        p.x += p.vx * dt; p.vx *= 0.9;
        p.y += p.vy * dt;
        if (p.y >= bin.top - PARTICLE_R) { addBody(bin, p); return false; }
        if (p.y > H + 30) return false;
        break;
      }
    }
    return true;
  }

  function addBody(bin, p) {
    if (bin.bodies.length >= bin.max) bin.bodies.shift();
    bin.bodies.push({
      x: Math.max(bin.left + PARTICLE_R, Math.min(bin.right - PARTICLE_R, p.x)),
      y: bin.top - PARTICLE_R,
      vx: p.vx * 0.3, vy: Math.max(1, p.vy),
      quality: p.quality, age: bodyAge++,
    });
  }

  // ---------- Bin physics (collision packing) ----------
  function simulateBin(bin, dt) {
    const bodies = bin.bodies;
    if (!bodies.length) return;
    const g = 0.3 * dt;
    const left = bin.left + PARTICLE_R;
    const right = bin.right - PARTICLE_R;
    const floor = bin.bottom - PARTICLE_R - 1;
    const diam = PARTICLE_R * 2;

    for (const b of bodies) {
      b.vy += g;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < left) { b.x = left; b.vx *= -0.3; }
      if (b.x > right) { b.x = right; b.vx *= -0.3; }
      if (b.y > floor) { b.y = floor; b.vy *= -0.2; b.vx *= 0.8; }
    }

    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < bodies.length; i++) {
        const a = bodies[i];
        for (let j = i + 1; j < bodies.length; j++) {
          const b = bodies[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < diam * diam && d2 > 0.0001) {
            const d = Math.sqrt(d2);
            const push = (diam - d) / 2;
            const nx = dx / d, ny = dy / d;
            a.x -= nx * push; a.y -= ny * push;
            b.x += nx * push; b.y += ny * push;
          } else if (d2 <= 0.0001) {
            a.x -= 0.3; b.x += 0.3;
          }
        }
      }
      for (const b of bodies) {
        if (b.x < left) b.x = left;
        if (b.x > right) b.x = right;
        if (b.y > floor) b.y = floor;
      }
    }

    for (const b of bodies) {
      b.vx *= 0.9; b.vy *= 0.98;
      if (Math.abs(b.vx) < 0.02) b.vx = 0;
    }
  }

  function pileTop(bin) {
    if (!bin.bodies.length) return bin.bottom;
    let min = bin.bottom;
    for (const b of bin.bodies) if (b.y < min) min = b.y;
    return min;
  }

  // ---------- Update ----------
  function update(dt) {
    geo.mouthHalf += (geo.mouthHalfTarget - geo.mouthHalf) * 0.12;
    geo.holeTHalf += (geo.holeTHalfTarget - geo.holeTHalf) * 0.12;

    const v = sliders.volume.value / 100;
    const rate = (0.1 + v * 1.0) * 0.4;
    spawnAcc += rate * dt;
    while (spawnAcc >= 1) { spawnParticle(); spawnAcc -= 1; }

    for (let i = particles.length - 1; i >= 0; i--) {
      if (!updateParticle(particles[i], dt)) particles.splice(i, 1);
    }
    for (const bin of binList) simulateBin(bin, dt);
  }

  // ---------- Rendering ----------
  function pointOnLowerSlope(side, t) {
    // side -1 left, +1 right; t 0 at collar, 1 at outlet
    const x1 = geo.centerX + side * geo.collarHalf, y1 = geo.collarY;
    const x2 = geo.centerX + side * geo.outletHalf, y2 = geo.outletY;
    return [lerp(x1, x2, t), lerp(y1, y2, t)];
  }

  function drawFunnel() {
    const cx = geo.centerX, mh = geo.mouthHalf;
    const ch = geo.collarHalf, oh = geo.outletHalf;

    // interior fill (full shape, holes are only breaks in the stroke)
    ctx.beginPath();
    ctx.moveTo(cx - mh, geo.funnelTopY);
    ctx.lineTo(cx - ch, geo.collarY);
    ctx.lineTo(cx - oh, geo.outletY);
    ctx.lineTo(cx - oh, geo.stemBottomY);
    ctx.lineTo(cx + oh, geo.stemBottomY);
    ctx.lineTo(cx + oh, geo.outletY);
    ctx.lineTo(cx + ch, geo.collarY);
    ctx.lineTo(cx + mh, geo.funnelTopY);
    ctx.closePath();
    ctx.fillStyle = COLORS.funnelFill;
    ctx.fill();

    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.funnelStroke;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    const hc = 0.5, hh = geo.holeTHalf;
    for (const side of [-1, 1]) {
      // upper slope: mouth rim -> collar
      ctx.beginPath();
      ctx.moveTo(cx + side * mh, geo.funnelTopY);
      ctx.lineTo(cx + side * ch, geo.collarY);
      ctx.stroke();
      // lower slope with a gap (the hole)
      const [sx, sy] = pointOnLowerSlope(side, Math.max(0, hc - hh));
      const [ex, ey] = pointOnLowerSlope(side, Math.min(1, hc + hh));
      ctx.beginPath();
      ctx.moveTo(cx + side * ch, geo.collarY);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(cx + side * oh, geo.outletY);
      ctx.lineTo(cx + side * oh, geo.stemBottomY);
      ctx.stroke();
      // hole edge accents
      ctx.fillStyle = COLORS.holeEdge;
      ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(ex, ey, 3, 0, Math.PI * 2); ctx.fill();
    }

    // mouth rim caps
    ctx.fillStyle = COLORS.funnelStroke;
    ctx.beginPath(); ctx.arc(cx - mh, geo.funnelTopY, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + mh, geo.funnelTopY, 4, 0, Math.PI * 2); ctx.fill();
  }

  function drawBin(bin) {
    const r = Math.min(18, bin.half * 0.45);
    ctx.beginPath();
    ctx.moveTo(bin.cx - bin.half, bin.top);
    ctx.lineTo(bin.cx - bin.half, bin.bottom - r);
    ctx.quadraticCurveTo(bin.cx - bin.half, bin.bottom, bin.cx - bin.half + r, bin.bottom);
    ctx.lineTo(bin.cx + bin.half - r, bin.bottom);
    ctx.quadraticCurveTo(bin.cx + bin.half, bin.bottom, bin.cx + bin.half, bin.bottom - r);
    ctx.lineTo(bin.cx + bin.half, bin.top);
    ctx.fillStyle = bin.fill;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = bin.stroke;
    ctx.lineJoin = "round";
    ctx.stroke();

    ctx.fillStyle = COLORS.label;
    ctx.font = "600 10px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(bin.label, bin.cx, bin.bottom + 16);
  }

  function drawGhost(bin) {
    if (bin.markLevelY == null) return;
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = COLORS.ghostLine;
    ctx.beginPath();
    ctx.moveTo(bin.left, bin.markLevelY);
    ctx.lineTo(bin.right, bin.markLevelY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawBubble(x, y, quality) {
    ctx.beginPath();
    ctx.arc(x, y, PARTICLE_R, 0, Math.PI * 2);
    ctx.fillStyle = quality ? COLORS.quality : COLORS.standardCore;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x - PARTICLE_R * 0.3, y - PARTICLE_R * 0.3, PARTICLE_R * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fill();
  }

  function drawLive(p) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, PARTICLE_R, 0, Math.PI * 2);
    ctx.fillStyle = p.quality ? COLORS.quality : COLORS.standard;
    ctx.fill();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    for (const bin of binList) {
      drawBin(bin);
      for (const b of bin.bodies) drawBubble(b.x, b.y, b.quality);
      drawGhost(bin);
    }
    drawFunnel();
    for (const p of particles) drawLive(p);
  }

  // ---------- Loop ----------
  let last = performance.now();
  function frame(now) {
    const elapsed = now - last;
    last = now;
    const dt = Math.min(elapsed / 16.67, 2.5);
    if (!paused) update(dt);
    render();
    requestAnimationFrame(frame);
  }

  // ---------- Controls ----------
  function syncSliderFill(el) { el.style.setProperty("--fill", el.value + "%"); }
  function levelLabel(v) {
    if (v < 20) return "Low";
    if (v < 45) return "Modest";
    if (v < 70) return "Good";
    if (v < 90) return "Strong";
    return "Max";
  }
  function onSlider(key) {
    const el = sliders[key];
    syncSliderFill(el);
    values[key].textContent = levelLabel(+el.value);
    computeGeometry(false);
  }
  function clearActivePreset() { presetBtns.forEach((b) => b.classList.remove("is-active")); }

  function clearFills() {
    binList.forEach((bin) => { bin.bodies.length = 0; });
    particles.length = 0;
    spawnAcc = 0;
  }

  Object.keys(sliders).forEach((key) => {
    sliders[key].addEventListener("input", () => { onSlider(key); clearActivePreset(); });
    onSlider(key);
  });

  presetBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = PRESETS[btn.dataset.preset];
      if (!p) return;
      sliders.funnel.value = p.funnel;
      sliders.branding.value = p.branding;
      sliders.volume.value = p.volume;
      Object.keys(sliders).forEach(onSlider);
      clearActivePreset();
      btn.classList.add("is-active");
    });
  });

  btnCompare.addEventListener("click", () => {
    if (!comparing) {
      binList.forEach((bin) => { bin.markLevelY = pileTop(bin); });
      clearFills();
      comparing = true;
      btnCompare.textContent = "Clear compare";
    } else {
      binList.forEach((bin) => { bin.markLevelY = null; });
      comparing = false;
      btnCompare.textContent = "Compare";
    }
  });

  btnPause.addEventListener("click", () => {
    paused = !paused;
    btnPause.textContent = paused ? "Resume" : "Pause";
    btnPause.classList.toggle("btn-ghost", paused);
    btnPause.classList.toggle("btn-primary", !paused);
  });

  btnReset.addEventListener("click", () => {
    clearFills();
    binList.forEach((bin) => { bin.markLevelY = null; });
    comparing = false;
    btnCompare.textContent = "Compare";
  });

  window.addEventListener("resize", resize);

  resize();
  requestAnimationFrame(frame);
})();
