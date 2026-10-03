import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DateService } from '../src/service.js';
import { HistoryStore } from '../src/db.js';
import { startServer } from '../src/api.js';

let base: string;
let close: () => void;
let store: HistoryStore;
let dir: string;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'datecal-test-'));
  store = new HistoryStore(join(dir, 'test.db'));
  const svc = new DateService(store);
  const s = await startServer(svc, 0); // 自动空闲端口
  base = `http://localhost:${s.port}`;
  close = s.close;
});

after(() => {
  close();
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

async function post(path: string, body: unknown) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

test('convert：儒略 1582-10-04 -> 格里高利 1582-10-14', async () => {
  const { status, json } = await post('/api/convert', { from: 'julian', to: 'gregorian', year: 1582, month: 10, day: 4 });
  assert.equal(status, 200);
  assert.deepEqual(json.to, { calendar: 'gregorian', year: 1582, month: 10, day: 14 });
  assert.equal(json.serial, -141428);
  assert.equal(json.weekdayName, '星期四');
});

test('add：混合模式 1582-10-04 +1 = 1582-10-15', async () => {
  const { json } = await post('/api/add', { calendar: 'mixed', year: 1582, month: 10, day: 4, days: 1 });
  assert.deepEqual({ year: json.to.year, month: json.to.month, day: json.to.day }, { year: 1582, month: 10, day: 15 });
});

test('add：负向加日 1970-01-01 -1 = 1969-12-31', async () => {
  const { json } = await post('/api/add', { calendar: 'gregorian', year: 1970, month: 1, day: 1, days: -1 });
  assert.deepEqual({ year: json.to.year, month: json.to.month, day: json.to.day }, { year: 1969, month: 12, day: 31 });
});

test('缺失标签返回 DATE_NOT_EXIST 错误码', async () => {
  const { status, json } = await post('/api/convert', { from: 'mixed', to: 'julian', year: 1582, month: 10, day: 10 });
  assert.equal(status, 400);
  assert.equal(json.error.code, 'DATE_NOT_EXIST');
});

test('非法日期与越界年份错误码', async () => {
  const a = await post('/api/validate', { calendar: 'gregorian', year: 1900, month: 2, day: 29 });
  assert.equal(a.json.valid, false);
  const b = await post('/api/weekday', { calendar: 'gregorian', year: 0, month: 1, day: 1 });
  assert.equal(b.json.error.code, 'INVALID_YEAR');
  const c = await post('/api/add', { calendar: 'gregorian', year: 9999, month: 12, day: 31, days: 1 });
  assert.equal(c.json.error.code, 'OUT_OF_RANGE');
});

test('diff：目标减来源，含跨历法', async () => {
  const { json } = await post('/api/diff', {
    fromCalendar: 'julian', toCalendar: 'gregorian',
    from: { year: 1582, month: 10, day: 4 }, to: { year: 1582, month: 10, day: 15 },
  });
  assert.equal(json.days, 1);
});

test('month：混合模式 1582-10 只有 21 个有效标签', async () => {
  const res = await fetch(`${base}/api/month?calendar=mixed&year=1582&month=10`);
  const json = await res.json();
  assert.equal(json.validCount, 21);
  assert.equal(json.missing.length, 10);
});

test('历史记录写入 SQLite 并可复查', async () => {
  const res = await fetch(`${base}/api/history?limit=100`);
  const { history } = await res.json();
  assert.ok(history.length >= 6);
  const conv = history.find((h: any) => h.kind === 'convert');
  assert.ok(conv.algorithmVersion);
  assert.ok(conv.ts);
  assert.equal(typeof conv.request, 'object');
});

