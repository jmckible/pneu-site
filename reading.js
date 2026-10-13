// The privacy and terms pages: the same desktop, holding still. They open in
// the last theme the reader saw on the home page (desk.js keeps it in
// localStorage), else Tokyo Night, or Rose Pine on a light system. Loaded in
// <head> after themes.js, so the colours are set before the first paint.
(() => {
  const THEMES = window.PNEU_THEMES;
  const root = document.documentElement;
  // ?theme=<id> wins, as on the home page.
  let id = new URLSearchParams(location.search).get("theme");
  if (!id) try { id = localStorage.getItem("pneu:theme"); } catch {}
  const t = THEMES.find(x => x.id === id) ||
    THEMES.find(x => x.id === (matchMedia("(prefers-color-scheme: light)").matches ? "rose-pine" : "tokyo-night"));
  for (const k of ["bg", "fg", "accent", "selection", "red"]) root.style.setProperty("--" + k, t[k]);
  root.dataset.mode = t.mode;
  root.dataset.theme = t.id;

  document.addEventListener("DOMContentLoaded", () => {
    const wall = document.querySelector(".wall-img");
    wall.sizes = "100vw";
    wall.srcset = `../themes/${t.id}-wall-s.webp 900w, ../themes/${t.id}-wall.webp 1920w`;

    const clock = document.querySelector(".clock");
    const tick = () => {
      const d = new Date();
      clock.textContent = d.toLocaleDateString("en-US", { weekday: "long" }) + " " +
        String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    };
    tick(); setInterval(tick, 15000);
  });
})();
