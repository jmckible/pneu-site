// pneu.mckible.com's home page: the page wears an Omarchy theme, and the hero's
// caption switches it. Each theme's colours are the four pneu's theme hook
// writes, plus its red.
//
// Every motion is a tween on requestAnimationFrame and performance.now, not a
// CSS transition or Web Animation, so a screen recorder that steps the page's
// clock records it as it plays.
(() => {
  const THEMES = window.PNEU_THEMES;
  const KEYS = ["bg", "fg", "accent", "selection", "red"];
  const root = document.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const light = matchMedia("(prefers-color-scheme: light)").matches;
  const phone = matchMedia("(max-width: 560px)");
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // ---------- tweens ----------
  // bezier(x1, y1, x2, y2) is CSS's cubic-bezier as a function of progress.
  function bezier(x1, y1, x2, y2) {
    const c = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
    return x => {
      if (x <= 0 || x >= 1) return x;
      let lo = 0, hi = 1, t = x;
      for (let i = 0; i < 24; i++) { t = (lo + hi) / 2; if (c(x1, x2, t) < x) lo = t; else hi = t; }
      return c(y1, y2, t);
    };
  }
  const linear = p => p;
  // tween calls fn(eased progress) every frame for ms, then done. Under
  // reduced motion it lands at once.
  function tween(ms, ease, fn, done, delay = 0) {
    if (reduced || ms <= 0) { fn(1); done && done(); return; }
    const s = performance.now() + delay;
    const f = n => {
      const p = Math.max(0, Math.min(1, (n - s) / ms));
      if (n >= s) fn(ease(p));
      if (p < 1) requestAnimationFrame(f); else done && done();
    };
    requestAnimationFrame(f);
  }
  const after = (ms, fn) => tween(ms, linear, () => {}, fn);
  const lerp = (a, b, p) => a + (b - a) * p;
  // seg maps p across keyframes [[at, value], ...], linearly between them.
  function seg(p, frames) {
    for (let i = 1; i < frames.length; i++) if (p <= frames[i][0]) {
      const [a0, v0] = frames[i - 1], [a1, v1] = frames[i];
      return lerp(v0, v1, (p - a0) / (a1 - a0 || 1));
    }
    return frames[frames.length - 1][1];
  }

  // On a phone the picture is the narrow window, which reads at that size.
  const files = t => ({
    wall: { srcset: `themes/${t.id}-wall-s.webp 900w, themes/${t.id}-wall.webp 1920w`, sizes: "100vw" },
    app: phone.matches
      ? { srcset: `themes/${t.id}-narrow.webp 640w`, sizes: "100vw" }
      : { srcset: `themes/${t.id}-app-s.webp 900w, themes/${t.id}-app.webp 2000w`, sizes: "(max-width: 980px) 100vw, 66vw" },
  });
  const command = t => `omarchy theme set "${t.name}"`;

  let cur = light ? 2 : 0;

  // ---------- loading ----------
  // A theme is shown only once its wallpaper and picture have decoded, so a
  // switch never flashes an empty frame. Nothing loads before it's asked.
  const cache = new Map();
  function load({ srcset, sizes }) {
    const key = srcset + sizes;
    if (!cache.has(key)) {
      const img = new Image();
      img.sizes = sizes; img.srcset = srcset;
      cache.set(key, img.decode().catch(() => {}).then(() => img.currentSrc));
    }
    return cache.get(key);
  }
  const preload = i => Promise.all([load(files(THEMES[i]).wall), load(files(THEMES[i]).app)]);

  // prepare puts spec into the hidden layer of holder and resolves, once it
  // has decoded, with the shown and the hidden layer.
  function prepare(holder, spec) {
    const layers = $$(".layer", holder);
    const on = layers.find(l => l.classList.contains("on"));
    const off = layers.find(l => l !== on);
    const img = $("img", off);
    // The shown layer may be choosing its file through <source>s (light or
    // phone): pin it to the file it shows before they go.
    const shown = $("img", on);
    if ($$("source", holder).length && shown.currentSrc) { shown.removeAttribute("sizes"); shown.srcset = shown.currentSrc; }
    $$("source", holder).forEach(s => s.remove());
    img.sizes = spec.sizes; img.srcset = spec.srcset;
    return img.decode().catch(() => {}).then(() => ({ on, off }));
  }
  function flip({ on, off }) {
    off.classList.add("on"); off.classList.remove("in"); on.classList.remove("on");
    off.style.opacity = off.style.clipPath = "";
    const a = $("img", on), b = $("img", off);
    if (a.alt) { b.alt = a.alt; a.alt = ""; }
  }

  // ---------- colours ----------
  function setColours(t, el = root) {
    for (const k of KEYS) el.style.setProperty("--" + k, t[k]);
    if (el === root) {
      root.dataset.mode = t.mode; root.dataset.theme = t.id;
      // The reading pages open in the last theme seen here.
      try { localStorage.setItem("pneu:theme", t.id); } catch {}
    }
    else el.style.colorScheme = t.mode;
  }

  // ---------- the wipe ----------
  // No colour is ever mixed. The hero's ground (veil, words, picture,
  // caption, prompt) is cloned and the clone wears the next theme, over its
  // own copy of the next wallpaper. A clip-path edge moves left to right
  // across the clone (and across the fixed wallpaper behind, for anything
  // outside the hero), so every pixel is wholly the old theme or wholly the
  // new one and the edge is the only seam. When it has crossed, the page
  // takes the new colours and the clone goes; the two are identical by then.
  // The clone is aria-hidden and inert and takes no pointer, so the copy
  // button and the caption's controls under it keep working throughout.
  const heroEl = $(".hero"), ground = $(".ground"), sweepEl = $(".sweep"), bar = $(".bar");
  const stack = $(".stack"), photo = $(".photo");
  const EASE = bezier(.65, 0, .35, 1);

  function nextGround(to, spec) {
    const g = ground.cloneNode(true);
    g.classList.add("next", "themed");
    g.setAttribute("aria-hidden", "true");
    g.inert = true;
    setColours(to, g);
    $$("[id]", g).forEach(e => e.removeAttribute("id"));
    const ph = $(".photo", g); ph.style.opacity = ph.style.transform = "";
    const st = $(".stack", g);
    $$("source", st).forEach(e => e.remove());
    $$(".layer:not(.on)", st).forEach(e => e.remove());
    const img = $(".layer.on img", st);
    img.alt = ""; img.sizes = spec.sizes; img.srcset = spec.srcset;
    return img.decode().catch(() => {}).then(() => g);
  }

  // The bar is on screen too: it gets the same treatment, a next-theme copy
  // laid over it and wiped by the same edge.
  function nextBar(to) {
    const b = bar.cloneNode(true);
    b.classList.add("next", "themed");
    b.setAttribute("aria-hidden", "true");
    b.inert = true;
    setColours(to, b);
    $$("[id]", b).forEach(e => e.removeAttribute("id"));
    return b;
  }

  function sweep(w, p, to) {
    const wallImg = $("img", w.off);
    const nw = wallImg.naturalWidth || 1920, nh = wallImg.naturalHeight || 1080, src = wallImg.currentSrc;
    return nextGround(to, files(to).app).then(g => {
      heroEl.insertBefore(g, sweepEl);
      const b = nextBar(to);
      bar.append(b);
      g.style.backgroundImage = `url("${src}")`;
      g.style.clipPath = "inset(0 100% 0 0)";
      w.off.classList.add("in");
      w.off.style.clipPath = "inset(0 100% 0 0)";
      return new Promise(res => tween(1300, EASE, q => {
        // The clone's wallpaper sits where the fixed one is drawn (cover,
        // centred on the viewport), measured every frame in case of scroll.
        const hr = heroEl.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
        const k = Math.max(vw / nw, vh / nh), bw = nw * k, bh = nh * k;
        g.style.backgroundSize = `${bw}px ${bh}px`;
        g.style.backgroundPosition = `${(vw - bw) / 2 - hr.left}px ${(vh - bh) / 2 - hr.top}px`;
        const x = q * (hr.width + 2);
        g.style.clipPath = `inset(0 ${Math.max(0, hr.width - x).toFixed(1)}px 0 0)`;
        w.off.style.clipPath = `inset(0 ${Math.max(0, vw - hr.left - x).toFixed(1)}px 0 0)`;
        b.style.clipPath = `inset(0 ${Math.max(0, vw - hr.left - x).toFixed(1)}px 0 0)`;
        sweepEl.style.left = x + "px";
        sweepEl.style.opacity = (q < .05 ? q / .05 : q > .95 ? (1 - q) / .05 : 1) * .8;
      }, () => {
        setColours(to);
        flip(w); flip(p);
        g.remove(); b.remove();
        sweepEl.style.opacity = 0;
        res();
      }));
    });
  }

  function show(i, { first = false } = {}) {
    cur = (i + THEMES.length) % THEMES.length;
    const t = THEMES[cur];
    typed.textContent = command(t);
    if (first) { setColours(t); return Promise.resolve(); }
    const f = files(t);
    return Promise.all([prepare($(".wall"), f.wall), prepare(stack, f.app)]).then(([w, p]) => sweep(w, p, t));
  }

  // ---------- the cycle ----------
  const typed = $(".typed");
  const pauseBtn = $(".pause");
  const HOLD = 4800, KEY = 42, ENTER = 380, SETTLE = 1100;
  let userPaused = false, heroSeen = true, phase = "hold", t0 = performance.now(), next = null, ready = false, busy = false;

  function pause(on) {
    userPaused = on;
    pauseBtn.setAttribute("aria-pressed", String(on));
    pauseBtn.textContent = on ? "play" : "pause";
    pauseBtn.setAttribute("aria-label", on ? "Resume the theme cycle" : "Pause the theme cycle");
    phase = "hold"; t0 = performance.now();
  }
  pauseBtn.addEventListener("click", () => pause(!userPaused));
  const settle = () => after(SETTLE, () => { busy = false; t0 = performance.now(); });
  const step = d => {
    if (busy) return;
    busy = true; next = null; phase = "hold";
    const j = (cur + d + THEMES.length) % THEMES.length;
    preload(j).then(() => show(j)).then(settle);
  };
  $(".next").addEventListener("click", () => step(1));
  $(".prev").addEventListener("click", () => step(-1));

  const running = () => !reduced && !userPaused && heroSeen && !document.hidden && !busy;

  function tick(now) {
    if (!running()) {
      if (phase !== "hold" && !busy) { phase = "hold"; typed.textContent = command(THEMES[cur]); }
      t0 = now - Math.min(now - t0, HOLD);
      return requestAnimationFrame(tick);
    }
    const dt = now - t0;
    if (phase === "hold") {
      if (next === null) { next = (cur + 1) % THEMES.length; ready = false; const n = next; preload(n).then(() => { if (next === n) ready = true; }); }
      if (dt > HOLD && ready) { phase = "type"; t0 = now; }
    } else if (phase === "type") {
      const text = command(THEMES[next]);
      const n = Math.min(text.length, Math.floor(dt / KEY));
      typed.textContent = text.slice(0, n);
      if (n === text.length && dt > text.length * KEY + ENTER) {
        busy = true; phase = "hold";
        const n2 = next; next = null;
        show(n2).then(settle);
      }
    }
    requestAnimationFrame(tick);
  }

  // The hero cycles only while it's on screen. Scrolled past, the page keeps
  // whichever theme the reader last saw.
  new IntersectionObserver(([e]) => { heroSeen = e.isIntersecting; }, { threshold: 0.3 }).observe(photo);

  // ?theme=<id> starts there (a link to one theme, and the studio's captures).
  const asked = THEMES.findIndex(t => t.id === new URLSearchParams(location.search).get("theme"));
  if (asked >= 0 && asked !== cur) {
    cur = asked; const t = THEMES[cur];
    setColours(t); typed.textContent = command(t);
    prepare($(".wall"), files(t).wall).then(flip); prepare(stack, files(t).app).then(flip);
  } else show(cur, { first: true });
  requestAnimationFrame(tick);

  // The picture is laid onto the desk once it has loaded.
  if (!reduced) {
    photo.style.opacity = "0";
    const shot = $(".layer.on img", stack);
    const lay = () => tween(860, bezier(.2, .7, .3, 1), q => {
      photo.style.opacity = seg(q, [[0, 0], [.4, 1], [1, 1]]);
      photo.style.transform = `translate(${seg(q, [[0, 60], [.75, -2], [1, 0]])}px, ${seg(q, [[0, -40], [.75, 2], [1, 0]])}px) rotate(${seg(q, [[0, 4], [.75, -.4], [1, 0]])}deg) scale(${seg(q, [[0, 1.06], [.75, .997], [1, 1]])})`;
    }, () => { photo.style.opacity = photo.style.transform = ""; });
    (shot.complete ? Promise.resolve() : shot.decode().catch(() => {})).then(lay);
  }

  // ---------- the bar ----------
  const clock = $(".clock");
  const tickClock = () => {
    const d = new Date();
    clock.textContent = d.toLocaleDateString("en-US", { weekday: "long" }) + " " +
      String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  };
  tickClock(); setInterval(tickClock, 15000);

  // The bar's workspaces follow the scroll: each section is one.
  const wsLinks = $$(".ws a");
  const sections = wsLinks.map(a => document.getElementById(a.hash.slice(1)));
  const wsIO = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) {
      const k = sections.indexOf(e.target);
      wsLinks.forEach((a, j) => a.classList.toggle("on", j === k));
    }
  }, { rootMargin: "-45% 0px -50% 0px" });
  sections.forEach(s => wsIO.observe(s));

  // ---------- copy ----------
  $$(".copy").forEach(btn => btn.addEventListener("click", async () => {
    const cmd = $(".cmd", btn.closest(".prompt"));
    const text = cmd.textContent.trim();
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch {}
    if (!ok) {
      const r = document.createRange(); r.selectNodeContents(cmd);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      try { ok = document.execCommand("copy"); } catch {}
    }
    btn.textContent = ok ? "copied" : "⌃C";
    btn.classList.toggle("done", ok);
    setTimeout(() => { btn.textContent = "copy"; btn.classList.remove("done"); }, 2200);
  }));

  // ---------- keyboard first ----------
  // pneu's own motions (motion.js, app.css): the cursor glides 110ms between
  // rows; an archived row slides right as it fades and its gap closes in
  // 280ms, the next row moving up into the cursor; "Archived · z to undo"
  // shows on the right of the key bar; after three uses a hint steps aside
  // (360ms width, 220ms opacity).
  const demo = $(".kdemo");
  const ol = $(".krows", demo);
  const pristine = ol.innerHTML;
  const keys = $(".kbar .keys", demo), status = $(".kbar .status", demo), cap = $(".press .cap", demo);
  const GLIDE = bezier(.2, .7, .3, 1), LEAVE = bezier(.3, .6, .2, 1), STEP = bezier(.2, .8, .2, 1);
  let at = 0, counts = {};
  const rows = () => $$(".row:not(.leaving)", ol);
  const cursorEl = () => $(".cursor", ol);

  function moveTo(i, instant) {
    const r = rows()[i]; if (!r) return;
    const c = cursorEl(), from = c.offsetTop, to = r.offsetTop;
    at = i;
    if (instant) { c.style.top = to + "px"; return; }
    tween(110, GLIDE, q => { c.style.top = lerp(from, to, q) + "px"; });
  }
  function learn(id, instant) {
    counts[id] = (counts[id] || 0) + 1;
    if (counts[id] < 3) return;
    const h = $(`.h[data-learn="${id}"]`, keys);
    if (instant) { h.classList.add("learned"); return; }
    const w = h.offsetWidth, m = parseFloat(getComputedStyle(h).marginRight);
    const start = performance.now();
    tween(360, STEP, q => {
      h.style.maxWidth = w * (1 - q) + "px";
      h.style.marginRight = m * (1 - q) + "px";
      h.style.opacity = Math.max(0, 1 - (performance.now() - start) / 220);
    }, () => { h.classList.add("learned"); h.style.maxWidth = h.style.marginRight = h.style.opacity = ""; });
  }
  // press shows the key as a keycap over the list and flashes its hint.
  function press(k, hint, instant) {
    if (instant) return;
    cap.textContent = k;
    const h = hint && $(`.h[data-learn="${hint}"]:not(.learned)`, keys);
    if (h) { h.classList.add("flash"); after(240, () => h.classList.remove("flash")); }
    tween(520, linear, q => {
      cap.style.opacity = seg(q, [[0, 0], [.15, 1], [.75, 1], [1, 0]]);
      cap.style.transform = `translateY(${seg(q, [[0, 4], [.15, 0], [.3, 2], [.45, 0], [1, 0]])}px)`;
      cap.style.borderBottomWidth = q > .15 && q < .45 ? "1px" : "3px";
    });
  }
  // move: j/k, or the arrows. Only j and k count toward the hint, as in
  // pneu (its data-learn is "j k").
  function move(key, instant) {
    const d = key === "j" || key === "↓" ? 1 : -1;
    press(key, "jk", instant);
    moveTo(Math.max(0, Math.min(rows().length - 1, at + d)), instant);
    if (key === "j" || key === "k") learn("jk", instant);
  }
  function archive(instant) {
    press("a", "a", instant);
    const r = rows()[at];
    status.classList.add("show");
    learn("a", instant);
    if (instant) { r.remove(); return; }
    const h = r.offsetHeight, pt = parseFloat(getComputedStyle(r).paddingTop);
    r.classList.add("leaving");
    tween(280, LEAVE, q => {
      r.style.opacity = seg(q, [[0, 1], [.5, 0], [1, 0]]);
      r.style.transform = `translateX(${seg(q, [[0, 0], [.5, 28], [1, 28]])}px)`;
      const k = seg(q, [[0, 1], [.5, 1], [1, 0]]);
      r.style.height = h * k + "px";
      r.style.paddingTop = r.style.paddingBottom = pt * k + "px";
      r.style.borderBottomWidth = k < 1 ? k + "px" : "";
    }, () => r.remove());
  }
  function reset() {
    ol.innerHTML = pristine; at = 0; counts = {};
    $$(".h", keys).forEach(h => h.classList.remove("learned"));
    status.classList.remove("show");
  }

  const SCRIPT = [
    [600, () => move("↓")], [1150, () => move("↓")], [1900, () => archive()],
    [2800, () => move("j")], [3350, () => move("j")], [4100, () => archive()],
    [5000, () => move("↑")], [5600, () => move("k")], [6400, () => archive()],
    [8200, () => status.classList.remove("show")],
    [9100, () => tween(260, linear, q => { demo.style.opacity = 1 - q; }, () => { reset(); tween(260, linear, q => { demo.style.opacity = q; }); })],
  ];
  const LOOP = 10000;

  if (reduced) {
    // A finished frame: one row archived, j/k already learned.
    move("j", true); move("j", true); archive(true); move("k", true);
  } else {
    let seen = false, start = 0, fired = 0;
    new IntersectionObserver(([e]) => {
      seen = e.isIntersecting;
      if (seen) { reset(); demo.style.opacity = ""; start = performance.now(); fired = 0; }
    }, { threshold: 0.5 }).observe(demo);
    const run = now => {
      if (seen) {
        const t = now - start;
        while (fired < SCRIPT.length && SCRIPT[fired][0] <= t) SCRIPT[fired++][1]();
        if (t >= LOOP) { start = now; fired = 0; }
      }
      requestAnimationFrame(run);
    };
    requestAnimationFrame(run);
  }

  // ---------- the paper card ----------
  // Its texture is the heaviest image below the fold: fetched on approach.
  new IntersectionObserver(([e], o) => { if (e.isIntersecting) { $(".card").classList.add("paper"); o.disconnect(); } }, { rootMargin: "600px" }).observe($(".card"));
})();
