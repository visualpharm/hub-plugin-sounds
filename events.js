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
  for (const s of snap?.sessions || []) out[s.name] = s.last_out || 0;
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
