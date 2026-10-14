// Звуки — плагин страницы Agents Hub (EXTENDING.md, API 1.x). Новое сообщение владельцу — короткий глухой «тук»;
// сессия ждёт его ответа (вопрос, карточка инструмента, «ждёт вас») — два мягких тона, заметнее. Что считать новым —
// events.js (чистая логика, тесты). Звук синтезирует WebAudio, файлов нет. Браузер пускает звук только после жеста на
// странице: AudioContext оживает на первом клике или клавише; до него звуки молча пропускаются. Выключить — «Настройки»
// → «Звуки» (хранится в этом браузере) или выключить плагин в «Настройки» → «Плагины».
import { diff, gate, react, MUTE_FOR } from "./events.js";

const KEY = "hub-sounds";
const DEFAULTS = { on: true, message: true, ask: true, volume: 0.6 };
const prefs = () => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return { ...DEFAULTS }; } };
const save = (p) => localStorage.setItem(KEY, JSON.stringify(p));
// шлюз (events.js gate) и «заглушено до» — общие для всех вкладок этого браузера
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(KEY + k) || "null") ?? d; } catch { return d; } };
const keep = (k, v) => localStorage.setItem(KEY + k, JSON.stringify(v));
const mutedUntil = () => Number(load(":muted", 0)) || 0;
// владелец отозвался — страница в фокусе: счёт сигналов без ответа с нуля
const reacted = () => keep(":gate", react(load(":gate", null)));
addEventListener("focus", reacted);
document.addEventListener("visibilitychange", () => { if (!document.hidden && document.hasFocus()) reacted(); });

let ctx = null;
function audio() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}
// первый жест на странице — оживить звук; пока не ожил, ловим каждый жест
const unlock = () => { if (audio()?.state === "running") ["pointerdown", "keydown"].forEach((e) => removeEventListener(e, unlock, true)); };
["pointerdown", "keydown"].forEach((e) => addEventListener(e, unlock, true));

// один тон: частота (или скольжение from→to), огибающая — быстрый вход и мягкое затухание, через фильтр низких
function tone(ac, out, { type, from, to = from, at, glide = 0.1, peak, decay, cutoff }) {
  const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
  o.type = type;
  o.frequency.setValueAtTime(from, at);
  if (to !== from) o.frequency.exponentialRampToValueAtTime(to, at + glide);
  f.type = "lowpass"; f.frequency.value = cutoff;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  o.connect(f).connect(g).connect(out);
  o.start(at); o.stop(at + decay + 0.05);
}

export const SOUNDS = {
  // глухой короткий «тук»: низкий синус со спадом высоты, как по дереву
  message: (ac, out, t) => tone(ac, out, { type: "sine", from: 320, to: 170, at: t, glide: 0.09, peak: 0.5, decay: 0.2, cutoff: 900 }),
  // два мягких тона вверх (ре — ля), с тихой октавой ниже для тепла
  ask: (ac, out, t) => {
    for (const [hz, dt] of [[587.33, 0], [880, 0.14]]) {
      tone(ac, out, { type: "triangle", from: hz, at: t + dt, peak: 0.32, decay: 0.55, cutoff: 2400 });
      tone(ac, out, { type: "sine", from: hz / 2, at: t + dt, peak: 0.14, decay: 0.45, cutoff: 1200 });
    }
  },
};

function play(kind, { test = false } = {}) {
  const p = prefs();
  if (!test && (!p.on || !p[kind])) return;
  const ac = audio();
  if (!ac || ac.state !== "running") return;   // жеста ещё не было — браузер не пустит, старое потом не догоняем
  if (!test) {
    // несколько вкладок хаба — звучит одна: кто первый записал, тот и играет
    const now = Date.now(), last = JSON.parse(localStorage.getItem(KEY + ":last") || "{}");
    if (last.kind === kind && now - last.t < 2000) return;
    localStorage.setItem(KEY + ":last", JSON.stringify({ kind, t: now }));
  }
  const out = ac.createGain();
  out.gain.value = Math.max(0, Math.min(1, p.volume));
  out.connect(ac.destination);
  SOUNDS[kind](ac, out, ac.currentTime + 0.01);
}

// сигнал: тот же звук — не чаще раза в 15 минут; три сигнала за 15 минут без отклика (страница не в фокусе) — звук
// глохнет сам на час; страница в фокусе — счёт с нуля (тот же алгоритм, что у клиента HubbaHub)
function cue(kind) {
  const p = prefs();
  if (!p.on || !p[kind]) return;
  const now = Date.now(), away = !document.hasFocus();
  if (!away) reacted();
  if (now < mutedUntil()) return;
  const g = gate(load(":gate", null), kind, now, away);
  keep(":gate", g.next);
  if (g.autoMute) { keep(":muted", now + MUTE_FOR); dispatchEvent(new Event("hub-sounds-muted")); return; }
  if (g.sound) play(kind);
}

function settings(root, hub) {
  if (root.dataset.built) return;   // render зовётся на каждом снимке — собрать один раз, иначе слетит фокус
  root.dataset.built = "1";
  const p = prefs();
  const row = (label, input) => { const l = hub.el("label", "sounds-row"); l.append(input, hub.el("span", null, label)); return l; };
  const check = (key, label) => {
    const i = hub.el("input"); i.type = "checkbox"; i.checked = p[key];
    i.addEventListener("change", () => { save({ ...prefs(), [key]: i.checked }); sync(); });
    return row(label, i);
  };
  const vol = hub.el("input"); vol.type = "range"; vol.min = "0"; vol.max = "1"; vol.step = "0.05"; vol.value = String(p.volume);
  vol.addEventListener("change", () => { save({ ...prefs(), volume: Number(vol.value) }); play("message", { test: true }); });
  const btn = (label, kind) => {
    const b = hub.el("button", "btn", label); b.type = "button";
    b.addEventListener("click", () => { audio(); setTimeout(() => play(kind, { test: true }), 30); });
    return b;
  };
  const all = check("on", "Звуки включены");
  // заглушено само (сигналы шли без ответа) — до какого времени и кнопка «Включить»
  const mute = hub.el("div", "sounds-muted");
  const drawMute = () => {
    const until = mutedUntil();
    mute.replaceChildren();
    mute.hidden = until <= Date.now();
    if (mute.hidden) return;
    const at = new Date(until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const b = hub.el("button", "btn", "Включить"); b.type = "button";
    b.addEventListener("click", () => { keep(":muted", 0); reacted(); drawMute(); });
    mute.append(hub.el("span", null, `Заглушено до ${at}: три сигнала подряд остались без ответа`), b);
  };
  drawMute();
  addEventListener("hub-sounds-muted", drawMute);
  setInterval(drawMute, 60_000);
  const parts = hub.el("div", "sounds-parts");
  const v = hub.el("label", "sounds-row"); v.append(hub.el("span", null, "Громкость"), vol);
  const tests = hub.el("div", "sounds-tests");
  tests.append(btn("▶ Сообщение", "message"), btn("▶ Ждёт вас", "ask"));
  parts.append(check("message", "Новое сообщение — короткий глухой звук"),
    check("ask", "Сессия ждёт вашего ответа (вопрос, карточка) — два тона"), v, tests);
  const sync = () => { parts.style.opacity = prefs().on ? "" : "0.5"; };
  sync();
  root.append(all, mute, parts, hub.el("p", "hint",
    "Хранится в этом браузере. Браузер пускает звук только после первого клика по странице. Свои сообщения и старое при открытии страницы не звучат. "
    + "Один и тот же звук — не чаще раза в 15 минут; три сигнала за 15 минут, пока страница не в фокусе, — звук глохнет сам на час."));
}

export default function register(hub) {
  hub.addStyle("sounds.css");
  let prev = null, seq = null;
  // невидимый элемент в подвале боковой панели — только ради вызова на каждом снимке
  hub.addSlot("sidebar.footer", {
    id: "sounds",
    order: 1000,
    render(root, snap) {
      root.hidden = true;
      if (!snap || snap.seq === seq) return;   // тот же снимок дорисовывается не раз
      seq = snap.seq;
      const r = diff(prev, snap);
      prev = r.next;
      if (r.kind) cue(r.kind);
    },
  });
  hub.addSettings({ id: "sounds", title: "Звуки", hint: "Звук на новые сообщения вам и на вопросы, где нужен ваш ответ",
    render: (root) => settings(root, hub) });
}
