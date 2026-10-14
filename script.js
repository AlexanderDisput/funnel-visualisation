/* ============================================================
   Recruiting Funnel — dark premium particle visualization
   Pure canvas, no dependencies.

     Budget & Visibility -> funnel MOUTH width (reach)
     Employer Branding   -> HOLE size in the V-shaped walls (leaks)
     Candidate Volume    -> spawn rate

   Candidates collide with the funnel walls (simple physics) and
   slide down into the outlet. Where the walls have a gap, some
   candidates leak out into DROPPED OFF (red/high-quality first).
   Bins pack with ball-to-ball collision.
   ============================================================ */

(() => {
  "use strict";

  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d");
  const TAU = Math.PI * 2;
  const PARTICLE_R = 4.6;

  const sliders = {
    funnel: document.getElementById("funnel"),
    branding: document.getElementById("branding"),
  };
  const btnPause = document.getElementById("pause");
  const btnReset = document.getElementById("reset");
  const presetBtns = Array.from(document.querySelectorAll(".chip"));

  const PRESETS = {
    weak: { funnel: 24, branding: 18 },
    balanced: { funnel: 55, branding: 60 },
    strong: { funnel: 86, branding: 90 },
  };

  // constant candidate trickle (50% of the former default volume rate)
  const SPAWN_RATE = 0.13;

  let W = 0, H = 0, dpr = 1;
  let paused = false;
  let sprites = null;

  const geo = {
    centerX: 0,
    funnelTopY: 0, outletY: 0, stemBottomY: 0,
    outletHalf: 0,
    mouthHalf: 0, mouthHalfTarget: 0,
    holeHalfT: 0.1, holeHalfTTarget: 0.1, // half-extent of the hole along the slope (param 0..0.5)
    pLeakStd: 0.4, pLeakQual: 0.6,
  };

  const bins = {};
  let binList = [];
  const particles = [];
  let spawnAcc = 0, bodyAge = 0;

  // ---------------- Setup ----------------
  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(360, rect.width);
    H = Math.max(420, rect.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildSprites();
    computeGeometry(true);
  }

  function makeSprite(quality) {
    const S = 30;
    const c = document.createElement("canvas");
    c.width = c.height = Math.round(S * dpr);
    const g = c.getContext("2d");
    g.scale(dpr, dpr);
    const cx = S / 2, cy = S / 2, R = PARTICLE_R;

    const glow = g.createRadialGradient(cx, cy, R * 0.5, cx, cy, S / 2);
    if (quality) { glow.addColorStop(0, "rgba(255,93,93,0.55)"); glow.addColorStop(1, "rgba(255,93,93,0)"); }
    else { glow.addColorStop(0, "rgba(120,150,210,0.28)"); glow.addColorStop(1, "rgba(120,150,210,0)"); }
    g.fillStyle = glow;
    g.beginPath(); g.arc(cx, cy, S / 2, 0, TAU); g.fill();

    const sph = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.2, cx, cy, R);
    if (quality) { sph.addColorStop(0, "#ffc6c6"); sph.addColorStop(0.5, "#ff6b6b"); sph.addColorStop(1, "#d6283a"); }
    else { sph.addColorStop(0, "#d6e0f3"); sph.addColorStop(0.5, "#93a6c9"); sph.addColorStop(1, "#59709c"); }
    g.fillStyle = sph;
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();

    g.fillStyle = "rgba(255,255,255,0.85)";
    g.beginPath(); g.arc(cx - R * 0.32, cy - R * 0.36, R * 0.26, 0, TAU); g.fill();

    return { canvas: c, size: S };
  }
  function buildSprites() { sprites = { std: makeSprite(false), q: makeSprite(true) }; }

  function makeBin(cfg) {
    return {
      cx: cfg.cx, top: cfg.top, bottom: cfg.bottom,
      left: cfg.left, right: cfg.right, half: cfg.half,
      bodies: [], max: cfg.max, accent: cfg.accent, label: cfg.label,
    };
  }

  function computeGeometry(snap) {
    geo.centerX = W / 2;
    const topPad = 88;
    const bottomPad = W < 760 ? 300 : 220;
    const binBottom = H - bottomPad;
    const U = binBottom - topPad;

    geo.funnelTopY = topPad + U * 0.00;
    geo.outletY = topPad + U * 0.52;
    geo.stemBottomY = topPad + U * 0.60;
    geo.outletHalf = Math.max(14, W * 0.026);

    const f = sliders.funnel.value / 100;
    const b = sliders.branding.value / 100;
    const openness = 1 - b;

    geo.mouthHalfTarget = W * (0.12 + 0.33 * f);
    geo.holeHalfTTarget = 0.05 + 0.30 * openness;   // along the slope
    geo.pLeakStd = clamp01(0.70 - 0.64 * b);
    geo.pLeakQual = clamp01(0.92 - 0.9 * b * b);

    if (snap || geo.mouthHalf === 0) {
      geo.mouthHalf = geo.mouthHalfTarget;
      geo.holeHalfT = geo.holeHalfTTarget;
    }

    if (snap || binList.length === 0) buildBins(binBottom, topPad, U);
  }

  function buildBins(binBottom, topPad, U) {
    const C = geo.centerX;
    const mainHalf = Math.min(W * 0.115, 145);   // smaller Applications container
    const lostHalf = Math.min(W * 0.085, 105);
    const nrHalf = Math.min(W * 0.07, 90);
    const gap = Math.max(W * 0.014, 12);
    const lostOffset = mainHalf + gap + lostHalf;
    const nrOffset = mainHalf + gap + 2 * lostHalf + gap + nrHalf;
    const mainTop = topPad + U * 0.72;
    const sideTop = topPad + U * 0.80;
    const inset = 7;

    bins.main = makeBin({ cx: C, half: mainHalf, left: C - mainHalf + inset, right: C + mainHalf - inset, top: mainTop, bottom: binBottom, max: 120, accent: "blue", label: "APPLICATIONS" });
    bins.lostL = makeBin({ cx: C - lostOffset, half: lostHalf, left: C - lostOffset - lostHalf + inset, right: C - lostOffset + lostHalf - inset, top: sideTop, bottom: binBottom, max: 80, accent: "mute", label: "DROPPED OFF" });
    bins.lostR = makeBin({ cx: C + lostOffset, half: lostHalf, left: C + lostOffset - lostHalf + inset, right: C + lostOffset + lostHalf - inset, top: sideTop, bottom: binBottom, max: 80, accent: "mute", label: "DROPPED OFF" });
    bins.nrL = makeBin({ cx: C - nrOffset, half: nrHalf, left: C - nrOffset - nrHalf + inset, right: C - nrOffset + nrHalf - inset, top: sideTop, bottom: binBottom, max: 65, accent: "faint", label: "NOT REACHED" });
    bins.nrR = makeBin({ cx: C + nrOffset, half: nrHalf, left: C + nrOffset - nrHalf + inset, right: C + nrOffset + nrHalf - inset, top: sideTop, bottom: binBottom, max: 65, accent: "faint", label: "NOT REACHED" });
    binList = [bins.nrL, bins.lostL, bins.main, bins.lostR, bins.nrR];
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp01(t) { return Math.max(0, Math.min(1, t)); }

  // ---------------- Particles ----------------
  function spawnParticle() {
    if (particles.length >= 340) return;
    particles.push({
      x: geo.centerX + (Math.random() - 0.5) * W * 0.92,
      y: -10 - Math.random() * 40,
      vx: (Math.random() - 0.5) * 0.3,
      vy: 1.6 + Math.random() * 1.0,
      quality: Math.random() < 0.17,
      state: "falling", classified: false, leakRolled: false, leaked: false,
      bin: null, entryX: 0, side: 0,
    });
  }

  function assignBin(p, bin) {
    p.bin = bin;
    p.entryX = Math.max(bin.left + PARTICLE_R, Math.min(bin.right - PARTICLE_R, bin.cx + (Math.random() - 0.5) * bin.half * 1.3));
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

  // circle vs. wall segment; slides the ball, rolls the leak dice inside the hole
  function resolveWall(p, ax, ay, bx, by, holeWall) {
    if (p.leaked) return;
    const ex = bx - ax, ey = by - ay;
    const len2 = ex * ex + ey * ey || 1;
    const t = ((p.x - ax) * ex + (p.y - ay) * ey) / len2;
    if (t < 0 || t > 1) return;

    // inward normal, oriented toward the funnel center
    let nx = ey, ny = -ex;
    const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    const mx = ax + ex * t;
    if (nx * (geo.centerX - mx) < 0) { nx = -nx; ny = -ny; }

    const sd = (p.x - ax) * nx + (p.y - ay) * ny; // signed distance from wall, inside = +
    if (sd >= PARTICLE_R || sd < -PARTICLE_R * 5) return;

    if (holeWall && t > 0.5 - geo.holeHalfT && t < 0.5 + geo.holeHalfT) {
      if (!p.leakRolled) {
        p.leakRolled = true;
        const pl = p.quality ? geo.pLeakQual : geo.pLeakStd;
        if (Math.random() < pl) p.leaked = true;
      }
      if (p.leaked) return; // slip through the gap
    }

    const pen = PARTICLE_R - sd;
    p.x += nx * pen; p.y += ny * pen;
    const vn = p.vx * nx + p.vy * ny;
    if (vn < 0) { p.vx -= vn * nx; p.vy -= vn * ny; } // kill into-wall velocity -> slide
    p.vx *= 0.985; // slope friction
  }

  function updateParticle(p, dt) {
    const g = 0.12 * dt;
    const cx = geo.centerX, mh = geo.mouthHalf, oh = geo.outletHalf;
    const top = geo.funnelTopY, outletY = geo.outletY, stemBottomY = geo.stemBottomY;

    switch (p.state) {
      case "falling": {
        p.vy += g; p.y += p.vy * dt; p.x += p.vx * dt;
        if (!p.classified && p.y >= top) classify(p);
        break;
      }

      case "infunnel": {
        p.vy += 0.14 * dt; p.vy = Math.min(p.vy, 5.5);
        p.x += p.vx * dt; p.y += p.vy * dt;

        resolveWall(p, cx - mh, top, cx - oh, outletY, true);
        resolveWall(p, cx + mh, top, cx + oh, outletY, true);
        resolveWall(p, cx - oh, outletY, cx - oh, stemBottomY, false);
        resolveWall(p, cx + oh, outletY, cx + oh, stemBottomY, false);

        if (p.leaked) {
          p.side = p.x <= cx ? -1 : 1;
          assignBin(p, p.side < 0 ? bins.lostL : bins.lostR);
          p.state = "tosettle";
          p.vx = p.side * (2.2 + Math.random() * 1.3);
          p.vy = 0.4;
          break;
        }
        if (p.y >= stemBottomY) { assignBin(p, bins.main); p.state = "tosettle"; }
        break;
      }

      case "tosettle": {
        const bin = p.bin;
        const clearing = Math.abs(p.x - bin.cx) > bin.half;
        p.vy += clearing ? g * 0.35 : g;
        p.x += (p.entryX - p.x) * 0.1 * dt;
        p.x += p.vx * dt; p.vx *= 0.9; p.y += p.vy * dt;
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

  function simulateBin(bin, dt) {
    const bodies = bin.bodies;
    if (!bodies.length) return;
    const g = 0.3 * dt;
    const left = bin.left + PARTICLE_R, right = bin.right - PARTICLE_R, floor = bin.bottom - PARTICLE_R - 1;
    const diam = PARTICLE_R * 2;

    for (const b of bodies) {
      b.vy += g; b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < left) { b.x = left; b.vx *= -0.3; }
      if (b.x > right) { b.x = right; b.vx *= -0.3; }
      if (b.y > floor) { b.y = floor; b.vy *= -0.2; b.vx *= 0.8; }
    }
    for (let it = 0; it < 3; it++) {
      for (let i = 0; i < bodies.length; i++) {
        const a = bodies[i];
        for (let j = i + 1; j < bodies.length; j++) {
          const b = bodies[j];
          const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
          if (d2 < diam * diam && d2 > 0.0001) {
            const d = Math.sqrt(d2), push = (diam - d) / 2, nx = dx / d, ny = dy / d;
            a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
          } else if (d2 <= 0.0001) { a.x -= 0.3; b.x += 0.3; }
        }
      }
      for (const b of bodies) {
        if (b.x < left) b.x = left;
        if (b.x > right) b.x = right;
        if (b.y > floor) b.y = floor;
      }
    }
    for (const b of bodies) { b.vx *= 0.9; b.vy *= 0.98; if (Math.abs(b.vx) < 0.02) b.vx = 0; }
  }

  // ---------------- Update ----------------
  function update(dt) {
    geo.mouthHalf += (geo.mouthHalfTarget - geo.mouthHalf) * 0.12;
    geo.holeHalfT += (geo.holeHalfTTarget - geo.holeHalfT) * 0.12;

    spawnAcc += SPAWN_RATE * dt;
    while (spawnAcc >= 1) { spawnParticle(); spawnAcc -= 1; }

    for (let i = particles.length - 1; i >= 0; i--) {
      if (!updateParticle(particles[i], dt)) particles.splice(i, 1);
    }
    for (const bin of binList) simulateBin(bin, dt);
  }

  // ---------------- Rendering ----------------
  function drawFunnel() {
    const cx = geo.centerX, mh = geo.mouthHalf, oh = geo.outletHalf;
    const top = geo.funnelTopY, outletY = geo.outletY, stemBottomY = geo.stemBottomY;
    const hh = geo.holeHalfT;

    // interior fill
    ctx.beginPath();
    ctx.moveTo(cx - mh, top);
    ctx.lineTo(cx - oh, outletY);
    ctx.lineTo(cx - oh, stemBottomY);
    ctx.lineTo(cx + oh, stemBottomY);
    ctx.lineTo(cx + oh, outletY);
    ctx.lineTo(cx + mh, top);
    ctx.closePath();
    const fg = ctx.createLinearGradient(0, top, 0, stemBottomY);
    fg.addColorStop(0, "rgba(91,157,255,0.10)");
    fg.addColorStop(1, "rgba(91,157,255,0.03)");
    ctx.fillStyle = fg;
    ctx.fill();

    ctx.save();
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "#6fa8ff";
    ctx.shadowColor = "rgba(91,157,255,0.75)";
    ctx.shadowBlur = 14;

    for (const side of [-1, 1]) {
      const ax = cx + side * mh, ay = top, bx = cx + side * oh, by = outletY;
      const hsx = lerp(ax, bx, 0.5 - hh), hsy = lerp(ay, by, 0.5 - hh);
      const hex = lerp(ax, bx, 0.5 + hh), hey = lerp(ay, by, 0.5 + hh);

      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(hsx, hsy); ctx.stroke();   // upper wall
      ctx.beginPath(); ctx.moveTo(hex, hey); ctx.lineTo(bx, by);                 // lower wall
      ctx.lineTo(cx + side * oh, stemBottomY); ctx.stroke();                     // stem

      ctx.shadowBlur = 10;
      ctx.fillStyle = "#bcd4ff";
      ctx.beginPath(); ctx.arc(hsx, hsy, 2.8, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(hex, hey, 2.8, 0, TAU); ctx.fill();
      ctx.shadowBlur = 14;
    }

    ctx.fillStyle = "#9cc2ff";
    ctx.beginPath(); ctx.arc(cx - mh, top, 3.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + mh, top, 3.5, 0, TAU); ctx.fill();
    ctx.restore();
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

    const fill = ctx.createLinearGradient(0, bin.top, 0, bin.bottom);
    fill.addColorStop(0, "rgba(255,255,255,0.015)");
    fill.addColorStop(1, "rgba(255,255,255,0.05)");
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.save();
    if (bin.accent === "blue") {
      ctx.strokeStyle = "rgba(111,168,255,0.85)";
      ctx.shadowColor = "rgba(91,157,255,0.5)";
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2.5;
    } else if (bin.accent === "mute") {
      ctx.strokeStyle = "rgba(159,176,204,0.35)";
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = "rgba(159,176,204,0.18)";
      ctx.lineWidth = 2;
    }
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = bin.accent === "blue" ? "rgba(156,194,255,0.85)" : "rgba(130,146,172,0.7)";
    ctx.font = "600 10px Inter, sans-serif";
    ctx.textAlign = "center";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "1.5px";
    ctx.fillText(bin.label, bin.cx, bin.bottom + 18);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  }

  function blit(p) {
    const spr = p.quality ? sprites.q : sprites.std;
    const s = spr.size;
    ctx.drawImage(spr.canvas, p.x - s / 2, p.y - s / 2, s, s);
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    for (const bin of binList) {
      drawBin(bin);
      for (const b of bin.bodies) blit(b);
    }
    drawFunnel();
    for (const p of particles) blit(p);
  }

  // ---------------- Loop ----------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 16.67, 2.5);
    last = now;
    if (!paused) update(dt);
    render();
    requestAnimationFrame(frame);
  }

  // ---------------- Controls ----------------
  function syncFill(el) { el.style.setProperty("--fill", el.value + "%"); }
  function onSlider(el) { syncFill(el); computeGeometry(false); }
  function clearActivePreset() { presetBtns.forEach((b) => b.classList.remove("is-active")); }
  function clearFills() { binList.forEach((bin) => (bin.bodies.length = 0)); particles.length = 0; spawnAcc = 0; }

  Object.values(sliders).forEach((el) => {
    el.addEventListener("input", () => { onSlider(el); clearActivePreset(); });
    syncFill(el);
  });

  presetBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = PRESETS[btn.dataset.preset];
      if (!p) return;
      sliders.funnel.value = p.funnel;
      sliders.branding.value = p.branding;
      Object.values(sliders).forEach(onSlider);
      clearActivePreset();
      btn.classList.add("is-active");
    });
  });

  btnPause.addEventListener("click", () => {
    paused = !paused;
    btnPause.classList.toggle("btn-ghost", paused);
    btnPause.classList.toggle("btn-primary", !paused);
  });

  btnReset.addEventListener("click", clearFills);

  window.addEventListener("resize", resize);

  // ---------------- Boot ----------------
  resize();
  requestAnimationFrame(frame);
})();
