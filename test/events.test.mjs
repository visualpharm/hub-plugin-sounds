// node --test test/
import test from "node:test";
import assert from "node:assert/strict";
import { diff } from "../events.js";

const sess = (name, extra = {}) => ({ name, state: "idle", last_out: 0, pending: [], requests: [], ...extra });
const snap = (seq, sessions, epoch = "e1") => ({ seq, epoch, sessions });

function run(...snaps) {
  let prev = null;
  return snaps.map((s) => { const r = diff(prev, s); prev = r.next; return r.kind; });
}

test("первый снимок — тишина, даже со старыми сообщениями и вопросами", () => {
  assert.deepEqual(run(snap(10, [sess("a", { last_out: 9, pending: [{ request_id: "q1" }] })])), [null]);
});

test("итог хода владельцу — сообщение", () => {
  assert.deepEqual(run(snap(10, [sess("a", { last_out: 5 })]), snap(12, [sess("a", { last_out: 12 })])), [null, "message"]);
});

test("снимок без нового итога (сообщение владельца, работа) — тишина", () => {
  assert.deepEqual(run(snap(10, [sess("a", { last_out: 5 })]), snap(11, [sess("a", { last_out: 5, state: "busy" })])),
    [null, null]);
});

test("вопрос формой — ждёт вас; тот же вопрос в следующих снимках — тишина", () => {
  const q = sess("a", { pending: [{ request_id: "q1", tool: "AskUserQuestion" }] });
  assert.deepEqual(run(snap(10, [sess("a")]), snap(11, [q]), snap(12, [q])), [null, "ask", null]);
});

test("вопрос и итог в одном снимке — звучит только ждёт вас", () => {
  const both = sess("a", { last_out: 11, pending: [{ request_id: "q1" }] });
  assert.deepEqual(run(snap(10, [sess("a")]), snap(11, [both])), [null, "ask"]);
});

test("запрос needs-owner, метка сторожа, падение — ждёт вас", () => {
  const base = snap(10, [sess("a")]);
  assert.deepEqual(run(base, snap(11, [sess("a", { requests: [{ tool: "mcp:x", since: 9, state: "needs-owner" }] })])), [null, "ask"]);
  assert.deepEqual(run(base, snap(11, [sess("a", { attention: { since: 5 } })])), [null, "ask"]);
  assert.deepEqual(run(base, snap(11, [sess("a", { state: "failed", since: 7 })])), [null, "ask"]);
  assert.deepEqual(run(base, snap(11, [sess("a", { requests: [{ tool: "mcp:x", since: 9, state: "granted" }] })])), [null, null]);
});

test("новая сессия: старый итог — тишина, свежий — сообщение", () => {
  const base = snap(10, [sess("a")]);
  assert.deepEqual(run(base, snap(11, [sess("a"), sess("b", { last_out: 4 })])), [null, null]);
  assert.deepEqual(run(base, snap(11, [sess("a"), sess("b", { last_out: 11 })])), [null, "message"]);
});

test("новый журнал (epoch) — заново, без звука", () => {
  assert.deepEqual(run(snap(10, [sess("a", { last_out: 3 })]), snap(20, [sess("a", { last_out: 19 })], "e2")), [null, null]);
});

test("повтор того же снимка — тишина", () => {
  const s = snap(11, [sess("a", { last_out: 11 })]);
  assert.deepEqual(run(snap(10, [sess("a")]), s, s), [null, "message", null]);
});
