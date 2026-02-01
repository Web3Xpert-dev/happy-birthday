/*  Romantic Birthday Tree + Photo Particle Portrait
    - No external libraries
    - Scene-based flow inspired by classic love.js
    - Progressive image loading (doesn't block animation)
    - Mobile friendly, defensive coding

    Folder structure:
      /index.html
      /style.css
      /main.js
      /images/face.jpeg
      /images/1.jpeg ... /images/25.jpeg
*/

(() => {
  "use strict";

  // -----------------------------
  // Canvas setup + DPR scaling
  // -----------------------------
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });

  const state = {
    w: 0, h: 0, dpr: 1,
    t0: performance.now(),
    now: performance.now(),
    dt: 16.7,
    running: true,
  };

  function resize() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1)); // cap for perf
    state.dpr = dpr;
    state.w = Math.floor(window.innerWidth);
    state.h = Math.floor(window.innerHeight);
    canvas.width = Math.floor(state.w * dpr);
    canvas.height = Math.floor(state.h * dpr);
    canvas.style.width = state.w + "px";
    canvas.style.height = state.h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize, { passive: true });
  resize();

  // -----------------------------
  // Utilities
  // -----------------------------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (t) => t * t * (3 - 2 * t);
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => (a + Math.floor(Math.random() * (b - a + 1)));

  // A soft romantic background (gradient + subtle stars)
  function drawBackground() {
    const { w, h } = state;

    // gradient
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#05081a");
    g.addColorStop(0.55, "#0a1230");
    g.addColorStop(1, "#1a0f2a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // subtle vignette
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.35, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
    vg.addColorStop(0, "rgba(255,255,255,0.03)");
    vg.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  // -----------------------------
  // Progressive image loader (non-blocking)
  // -----------------------------
  function loadImage(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.loading = "eager";
      img.crossOrigin = "anonymous";
      img.onload = () => resolve({ ok: true, img, url });
      img.onerror = () => resolve({ ok: false, img: null, url });
      img.src = url;
    });
  }

  // Start loading immediately, but do not block scenes
  const images = {
    face: { ok: false, img: null },
    tiles: [], // {ok, img}
    tilesReadyCount: 0
  };

  (async function startLoading() {
    // Face mask image
    const faceRes = await loadImage("images/face.jpeg");
    if (faceRes.ok) {
      images.face.ok = true;
      images.face.img = faceRes.img;
    }

    // Tile images 1..25 (progressively)
    for (let i = 1; i <= 25; i++) {
      // Stagger requests a bit to be nicer on slow networks
      await new Promise(r => setTimeout(r, 20));
      loadImage(`images/${i}.jpeg`).then((res) => {
        images.tiles[i - 1] = { ok: res.ok, img: res.img || null };
        if (res.ok) images.tilesReadyCount++;
      });
    }
  })();

  function getRandomTileImage() {
    // Try a few random picks from what is loaded; fallback to null
    if (!images.tiles || images.tiles.length === 0) return null;
    for (let k = 0; k < 6; k++) {
      const idx = randi(0, images.tiles.length - 1);
      const it = images.tiles[idx];
      if (it && it.ok && it.img) return it.img;
    }
    return null;
  }

  // -----------------------------
  // Scene system
  // -----------------------------
  const SceneName = Object.freeze({
    SEED: "seed",
    TREE: "tree",
    PAUSE: "pause",
    FACE: "face",
  });

  const scene = {
    name: SceneName.SEED,
    timeIn: 0,
    switchTo(next) {
      this.name = next;
      this.timeIn = 0;
    }
  };

  // -----------------------------
  // Seed / intro animation
  // -----------------------------
  const seed = {
    x: 0,
    y: 0,
    r: 6,
    bloom: 0, // 0..1
    init() {
      seed.x = state.w * 0.5;
      seed.y = state.h * 0.78;
      seed.r = Math.max(5, Math.min(10, state.w * 0.01));
      seed.bloom = 0;
    },
    update(dt) {
      // gentle pulse that "awakens" the scene
      const t = clamp(scene.timeIn / 2.2, 0, 1);
      seed.bloom = smoothstep(t);
    },
    draw() {
      const { x, y, r, bloom } = seed;

      // soft halo
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 10);
      glow.addColorStop(0, `rgba(255,160,200,${0.16 * bloom})`);
      glow.addColorStop(1, "rgba(255,160,200,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r * 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // seed dot
      ctx.save();
      ctx.fillStyle = `rgba(255,210,230,${0.85 * bloom})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };

  // -----------------------------
  // Procedural tree (recursive branches)
  // -----------------------------
  const tree = {
    segments: [], // precomputed branch segments with growth progress
    grown: false,
    progress: 0, // 0..1
    baseX: 0,
    baseY: 0,
    init() {
      this.segments = [];
      this.grown = false;
      this.progress = 0;

      this.baseX = state.w * 0.5;
      this.baseY = state.h * 0.82;

      // Generate a romantic, slightly curved trunk with branches.
      // We'll precompute segments, then "reveal" them over time.
      const trunkLen = Math.min(260, state.h * 0.32);
      const root = {
        x: this.baseX,
        y: this.baseY,
        angle: -Math.PI / 2,
        len: trunkLen,
        thickness: Math.max(6, Math.min(14, state.w * 0.02)),
        depth: 0,
        swaySeed: rand(0, 1000)
      };

      this._growRecursive(root, 7); // depth 7 yields a fuller tree
      // Sort segments by depth then by y so growth feels natural (bottom-up)
      this.segments.sort((a, b) => (a.depth - b.depth) || (b.p0.y - a.p0.y));
    },
    _growRecursive(node, maxDepth) {
      const { x, y, angle, len, thickness, depth, swaySeed } = node;

      // Curve control points (bezier-ish)
      const bend = rand(-0.35, 0.35);
      const p0 = { x, y };
      const p3 = {
        x: x + Math.cos(angle + bend * 0.15) * len,
        y: y + Math.sin(angle + bend * 0.15) * len
      };
      const p1 = {
        x: x + Math.cos(angle + bend) * (len * 0.35),
        y: y + Math.sin(angle + bend) * (len * 0.35)
      };
      const p2 = {
        x: x + Math.cos(angle - bend * 0.3) * (len * 0.7),
        y: y + Math.sin(angle - bend * 0.3) * (len * 0.7)
      };

      this.segments.push({
        p0, p1, p2, p3,
        thickness,
        depth,
        swaySeed,
      });

      if (depth >= maxDepth) return;

      // Branching: fewer branches at top depth
      const branchCount = depth < 2 ? 2 : (Math.random() < 0.65 ? 2 : 1);
      for (let i = 0; i < branchCount; i++) {
        const t = rand(0.45, 0.88);
        const bx = cubicBezier(p0.x, p1.x, p2.x, p3.x, t);
        const by = cubicBezier(p0.y, p1.y, p2.y, p3.y, t);

        const childLen = len * rand(0.58, 0.78);
        const childTh = thickness * rand(0.62, 0.78);
        const childAngle = angle + rand(-0.75, 0.75) * (1.0 - depth / (maxDepth + 1));

        this._growRecursive({
          x: bx,
          y: by,
          angle: childAngle,
          len: childLen,
          thickness: childTh,
          depth: depth + 1,
          swaySeed: swaySeed + i * 97.13 + depth * 33.7
        }, maxDepth);
      }
    },
    update(dt) {
      // Growth over ~6-8 seconds depending on device width
      const growTime = clamp(6.5 - state.w / 900, 4.8, 7.2);
      const t = clamp(scene.timeIn / growTime, 0, 1);
      this.progress = smoothstep(t);
      this.grown = (t >= 1);
    },
    draw() {
      const n = this.segments.length;
      const revealCount = Math.floor(n * this.progress);

      // Tree color palette
      const trunk = "rgba(255,220,235,0.20)";
      const bark = "rgba(120,80,120,0.60)";

      for (let i = 0; i < revealCount; i++) {
        const s = this.segments[i];

        // soft sway (very gentle, no harsh physics)
        const sway = Math.sin((state.now * 0.001) + s.swaySeed) * (0.6 + s.depth * 0.15);
        const ox = sway * 0.55;
        const oy = sway * 0.08;

        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        // subtle highlight underlay
        ctx.strokeStyle = trunk;
        ctx.lineWidth = s.thickness + 2;
        ctx.beginPath();
        ctx.moveTo(s.p0.x, s.p0.y);
        ctx.bezierCurveTo(
          s.p1.x + ox, s.p1.y + oy,
          s.p2.x + ox, s.p2.y + oy,
          s.p3.x + ox, s.p3.y + oy
        );
        ctx.stroke();

        // main bark
        ctx.strokeStyle = bark;
        ctx.lineWidth = s.thickness;
        ctx.beginPath();
        ctx.moveTo(s.p0.x, s.p0.y);
        ctx.bezierCurveTo(
          s.p1.x + ox, s.p1.y + oy,
          s.p2.x + ox, s.p2.y + oy,
          s.p3.x + ox, s.p3.y + oy
        );
        ctx.stroke();

        ctx.restore();
      }

      // Ground shadow
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.beginPath();
      ctx.ellipse(this.baseX, this.baseY + 18, 120, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };

  function cubicBezier(a, b, c, d, t) {
    const mt = 1 - t;
    return (mt * mt * mt) * a + 3 * (mt * mt) * t * b + 3 * mt * (t * t) * c + (t * t * t) * d;
  }

  // -----------------------------
  // Face particle system
  // -----------------------------
  const facePortrait = {
    ready: false,
    targetPoints: [],   // [{x,y,lum}]
    particles: [],      // particle objects
    builtOnce: false,
    fadeIn: 0,          // 0..1

    // Offscreen canvases
    off: null,
    offCtx: null,

    init() {
      this.ready = false;
      this.targetPoints = [];
      this.particles = [];
      this.builtOnce = false;
      this.fadeIn = 0;

      // Create offscreen canvas
      this.off = document.createElement("canvas");
      this.offCtx = this.off.getContext("2d", { willReadFrequently: true });
    },

    tryBuildTargets() {
      // Build target points only when face image is available
      if (this.builtOnce) return;
      if (!images.face.ok || !images.face.img) return;

      const faceImg = images.face.img;

      // Determine on-screen placement for the portrait (above the tree)
      const portraitW = Math.min(420, state.w * 0.58);
      const portraitH = portraitW; // square sampling works well for centered portraits
      this.off.width = Math.floor(portraitW);
      this.off.height = Math.floor(portraitH);

      // Draw face into offscreen canvas
      this.offCtx.clearRect(0, 0, portraitW, portraitH);
      // cover fit
      drawCover(this.offCtx, faceImg, 0, 0, portraitW, portraitH);

      // Read pixels and select points
      const imgData = this.offCtx.getImageData(0, 0, portraitW, portraitH).data;

      // Sampling step controls particle count (mobile friendly)
      const step = clamp(Math.floor(portraitW / 80), 4, 8); // 4..8
      const points = [];

      // Build a "mask" from luminance + edge-ish detection
      for (let y = 0; y < portraitH; y += step) {
        for (let x = 0; x < portraitW; x += step) {
          const i = (y * portraitW + x) * 4;
          const r = imgData[i], g = imgData[i + 1], b = imgData[i + 2];
          const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

          // A heuristic: keep mid-to-bright pixels more often,
          // but still include darker ones occasionally to keep facial depth.
          const keepProb = clamp((lum - 0.15) * 1.6, 0, 1);
          if (Math.random() < keepProb) {
            points.push({ x, y, lum });
          }
        }
      }

      // If image is very dark or unusual, ensure minimum points
      if (points.length < 600) {
        for (let k = 0; k < 900; k++) {
          points.push({
            x: randi(0, portraitW - 1),
            y: randi(0, portraitH - 1),
            lum: rand(0.2, 0.9)
          });
        }
      }

      this.targetPoints = points;
      this.ready = true;
      this.builtOnce = true;

      // Initialize particles progressively (don’t create all at once)
      this.particles = [];
    },

    spawnBatch(maxNew = 120) {
      if (!this.ready) return;

      const total = this.targetPoints.length;
      if (this.particles.length >= total) return;

      const start = this.particles.length;
      const end = Math.min(total, start + maxNew);

      // Portrait placement in world coordinates
      const portraitW = this.off.width;
      const portraitH = this.off.height;

      const centerX = state.w * 0.5;
      const topY = state.h * 0.25;

      const left = centerX - portraitW * 0.5;
      const top = topY;

      for (let i = start; i < end; i++) {
        const p = this.targetPoints[i];

        // target position in main canvas
        const tx = left + p.x;
        const ty = top + p.y;

        const baseSize = clamp(portraitW / 40, 7, 14);
        const size = baseSize * rand(0.70, 1.25);

        // Spawn from below / near tree top for romantic reveal
        const spawnX = centerX + rand(-30, 30);
        const spawnY = state.h * 0.62 + rand(0, 40);

        this.particles.push({
          tx, ty,
          x: spawnX, y: spawnY,
          vx: 0, vy: 0,
          size,
          rot: rand(-Math.PI, Math.PI),
          rotV: rand(-0.012, 0.012),
          a: 0, // alpha 0..1
          lum: p.lum,
          img: getRandomTileImage(), // may be null now; can be assigned later
          // stagger delay so it feels like "forming"
          delay: rand(0, 1.2)
        });
      }
    },

    update(dt) {
      // Ensure targets are built once face is loaded (non-blocking)
      this.tryBuildTargets();

      // Progressive spawn (mobile friendly)
      this.spawnBatch(state.w < 520 ? 70 : 120);

      // Fade in overall portrait in this scene
      const t = clamp(scene.timeIn / 2.2, 0, 1);
      this.fadeIn = smoothstep(t);

      // Update particles with soft motion (no harsh physics)
      const settle = 0.085;
      const damp = 0.88;

      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];

        // Assign image later if it was not available at spawn time
        if (!p.img) p.img = getRandomTileImage();

        // Wait a bit before moving
        const localT = scene.timeIn - p.delay;
        if (localT < 0) continue;

        // Ease into place
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;

        p.vx = (p.vx + dx * settle) * damp;
        p.vy = (p.vy + dy * settle) * damp;

        // Slight float
        const float = Math.sin((state.now * 0.001) + i * 0.03) * 0.10;

        p.x += p.vx;
        p.y += p.vy + float;

        p.rot += p.rotV;

        // alpha approaches based on luminance so facial highlights read better
        const targetA = clamp(0.55 + p.lum * 0.55, 0.35, 0.95);
        p.a = lerp(p.a, targetA, 0.06);
      }
    },

    draw() {
      if (!this.ready) {
        // Soft hint text (no placeholder assets; just UX)
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = "rgba(255,255,255,0.70)";
        ctx.font = "600 13px system-ui, -apple-system, Segoe UI, Roboto, Arial";
        ctx.textAlign = "center";
        ctx.fillText("Loading portrait…", state.w * 0.5, state.h * 0.25);
        ctx.restore();
        return;
      }

      // Subtle glow behind portrait area
      const portraitW = this.off.width;
      const centerX = state.w * 0.5;
      const topY = state.h * 0.25;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createRadialGradient(centerX, topY + portraitW * 0.45, 0, centerX, topY + portraitW * 0.45, portraitW * 0.75);
      glow.addColorStop(0, `rgba(255,160,210,${0.10 * this.fadeIn})`);
      glow.addColorStop(1, "rgba(255,160,210,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(centerX, topY + portraitW * 0.45, portraitW * 0.75, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Draw particles
      ctx.save();
      ctx.globalAlpha = this.fadeIn;

      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        if (!p.img) continue; // defensive: skip if not loaded yet

        const s = p.size;
        const a = p.a;

        ctx.save();
        ctx.globalAlpha = this.fadeIn * a;

        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);

        // Soft edge via shadow blur (cheap) + rounded clip
        ctx.shadowColor = "rgba(0,0,0,0.20)";
        ctx.shadowBlur = 6;

        roundedClip(ctx, -s * 0.5, -s * 0.5, s, s, Math.max(3, s * 0.2));
        // Draw tile image centered
        ctx.drawImage(p.img, -s * 0.5, -s * 0.5, s, s);

        ctx.restore();
      }

      ctx.restore();
    }
  };

  function roundedClip(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.clip();
  }

  function drawCover(ctx2, img, x, y, w, h) {
    // Draw image to cover area (center-crop)
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;

    const scale = Math.max(w / iw, h / ih);
    const nw = iw * scale;
    const nh = ih * scale;
    const dx = x + (w - nw) * 0.5;
    const dy = y + (h - nh) * 0.5;
    ctx2.drawImage(img, dx, dy, nw, nh);
  }

  // -----------------------------
  // Orchestration: scene flow
  // -----------------------------
  function resetAll() {
    seed.init();
    tree.init();
    facePortrait.init();
    scene.switchTo(SceneName.SEED);
  }
  resetAll();

  document.getElementById("replay").addEventListener("click", () => {
    resetAll();
  });

  function update(dt) {
    scene.timeIn += dt;

    if (scene.name === SceneName.SEED) {
      seed.update(dt);
      // Move to tree after ~2.4 seconds
      if (scene.timeIn > 2.4) scene.switchTo(SceneName.TREE);
    }
    else if (scene.name === SceneName.TREE) {
      tree.update(dt);
      if (tree.grown) scene.switchTo(SceneName.PAUSE);
    }
    else if (scene.name === SceneName.PAUSE) {
      // gentle pause to breathe
      if (scene.timeIn > 1.2) scene.switchTo(SceneName.FACE);
    }
    else if (scene.name === SceneName.FACE) {
      facePortrait.update(dt);
    }
  }

  function draw() {
    drawBackground();

    // Always draw tree once started, so it stays visible
    if (scene.name === SceneName.SEED) {
      seed.draw();
      // tiny hint of trunk base
      tree.draw(); // draws 0 segments initially, harmless
    } else {
      tree.draw();
      if (scene.name === SceneName.FACE) {
        facePortrait.draw();
      } else if (scene.name === SceneName.PAUSE) {
        // soft breathing glow at the top of the tree (romantic pause)
        drawTreeBloomHint();
      }
    }

    // Optional: tiny status for debugging (comment out for production)
    // drawDebug();
  }

  function drawTreeBloomHint() {
    const x = tree.baseX;
    // approximate top of trunk (not exact; aesthetic only)
    const y = tree.baseY - Math.min(260, state.h * 0.32);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const pulse = (Math.sin(state.now * 0.002) * 0.5 + 0.5);
    const r = 34 + pulse * 10;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,170,220,${0.10 + pulse * 0.05})`);
    g.addColorStop(1, "rgba(255,170,220,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawDebug() {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    ctx.fillText(`scene=${scene.name} t=${scene.timeIn.toFixed(2)} tilesReady=${images.tilesReadyCount}/25`, 14, 18);
    ctx.restore();
  }

  // -----------------------------
  // Main RAF loop
  // -----------------------------
  function frame(now) {
    if (!state.running) return;
    state.now = now;
    state.dt = clamp(now - state.t0, 0, 40); // clamp for stability on tab switches
    state.t0 = now;

    const dtSeconds = state.dt / 1000;

    update(dtSeconds);
    draw();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

})();
