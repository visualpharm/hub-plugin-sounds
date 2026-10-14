// Что нового между двумя снимками ядра — чистая логика без звука и DOM (тесты: test/events.test.mjs).
//
// «Сообщение» — у сессии вырос last_out: итог хода ушёл владельцу (ядро ставит его только на непустой итог; свои
// сообщения владельца его не трогают). «Ждёт вас» — появилось новое, на что нужен ответ владельца: вопрос формой или
// запрос инструмента (pending), запрос в needs-owner, метка сторожа (attention), упавшая сессия.

// ключи того, что ждёт владельца: новый ключ — новый повод звучать; тот же вопрос в следующих снимках — тишина
export function waitKeys(sessions) {
  const keys = new Set();
  for (const s of sessions || []) {
    for (const p of s.pending || []) keys.add(`${s.name}:p:${p.request_id ?? p.tool}`);
    for (const r of s.requests || []) if (r.state === "needs-owner") keys.add(`${s.name}:r:${r.tool}:${r.since ?? ""}`);
    if (s.attention) keys.add(`${s.name}:a:${s.attention.since ?? ""}`);
    if (s.state === "failed") keys.add(`${s.name}:failed:${s.since ?? ""}`);
  }
  return keys;
}

// снимок -> то, что запомнить для следующего сравнения
export function digest(snap) {
  const out = {};
  // owner_out — итог, который ушёл владельцу (ответ сессии хабу или другой сессии его не поднимает); у старого ядра
  // поля нет — тогда last_out, как раньше
  for (const s of snap?.sessions || []) out[s.name] = s.owner_out ?? s.last_out ?? 0;
  return { epoch: snap?.epoch ?? null, seq: snap?.seq || 0, out, waits: waitKeys(snap?.sessions) };
}

// prev — digest прошлого снимка (null — первый снимок страницы: запомнить, не звучать: старое не озвучиваем).
// Возвращает {kind: "ask" | "message" | null, next}. «Ждёт вас» важнее: в одном снимке оба — звучит только он.
export function diff(prev, snap) {
  const next = digest(snap);
  if (!prev || prev.epoch !== next.epoch || next.seq < prev.seq) return { kind: null, next };   // новый журнал — заново
  if (next.seq === prev.seq) return { kind: null, next: prev };
  for (const k of next.waits) if (!prev.waits.has(k)) return { kind: "ask", next };
  // сессия, которой не было в прошлом снимке: новое — только то, что случилось после него
  for (const [name, seq] of Object.entries(next.out)) if (seq > (prev.out[name] ?? prev.seq)) return { kind: "message", next };
  return { kind: null, next };
}

// Слышен ли сигнал — тот же алгоритм, что у клиента HubbaHub (Sounds.swift, SoundEvents.gate). Один и тот же звук — не
// чаще раза в REPEAT_GAP: не услышал раз — не услышит и второй. Сигналы идут, а владелец не отзывается (страница не в
// фокусе) — IGNORED_LIMIT сигналов за REPEAT_GAP, и звук глушится сам на MUTE_FOR. Отклик (страница в фокусе) обнуляет
// счёт. g = {heard: {kind: мс}, ignored: [мс]}; away — сигнал пришёл, когда страница не в фокусе.
export const REPEAT_GAP = 15 * 60 * 1000, IGNORED_LIMIT = 3, MUTE_FOR = 60 * 60 * 1000;

export function gate(g, kind, now, away) {
  const next = { heard: { ...(g?.heard || {}) }, ignored: [...(g?.ignored || [])] };
  if (away) {
    next.ignored = next.ignored.filter((t) => now - t < REPEAT_GAP && t <= now).concat(now);
    if (next.ignored.length >= IGNORED_LIMIT) return { sound: false, autoMute: true, next: { ...next, ignored: [] } };
  }
  const t = g?.heard?.[kind];
  if (t != null && now >= t && now - t < REPEAT_GAP) return { sound: false, autoMute: false, next };
  next.heard[kind] = now;
  return { sound: true, autoMute: false, next };
}

// владелец отозвался (страница в фокусе) — счёт сигналов без ответа с нуля
export const react = (g) => ({ heard: { ...(g?.heard || {}) }, ignored: [] });
