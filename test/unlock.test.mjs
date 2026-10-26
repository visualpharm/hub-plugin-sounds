// Первое касание страницы не создаёт звук: AudioContext — заранее, в простое после загрузки (создать его — поднять
// аудиоустройство, 0,2–0,6 с, в обработчике касания это задерживало ответ страницы); касание только оживляет его
import test from "node:test";
import assert from "node:assert/strict";

const listeners = {}, idle = [];
let made = 0, resumed = 0;
class FakeAudio {
  constructor() { made += 1; this.state = "suspended"; }
  resume() { resumed += 1; this.state = "running"; return Promise.resolve(); }
}
const store = new Map();
Object.assign(globalThis, {
  window: globalThis,
  AudioContext: FakeAudio,
  requestIdleCallback: (f) => idle.push(f),
  addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
  removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter((x) => x !== fn); },
  localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
  document: { addEventListener() {}, hidden: false, hasFocus: () => true },
});
await import("../main.js");

test("контекст создаётся в простое, касание только оживляет его", async () => {
  assert.equal(made, 0);                      // при загрузке — ничего
  idle.forEach((f) => f());
  assert.equal(made, 1);                      // в простое — создан, молчит
  for (const fn of listeners.pointerdown) fn();
  assert.equal(made, 1);                      // касание не создаёт второй
  assert.equal(resumed, 1);
  await Promise.resolve();
  assert.equal((listeners.pointerdown || []).length, 0);   // ожил — касания больше не ловим
});
