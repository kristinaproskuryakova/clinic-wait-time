// Проверки модуля прогноза на примерах из tests.md. Запуск: node --test tests
const test = require('node:test');
const assert = require('node:assert');
const { loadSrc } = require('./load');

const g = loadSrc();
const T = (hh, mm) => new Date(2026, 10, 21, hh, mm);        // 21.11.2026 hh:mm
const hm = (d) => d.getHours() + '.' + String(d.getMinutes()).padStart(2, '0');
const A = (key, hh, mm, status, extra) => Object.assign(
  { key, at: T(hh, mm), duration: 25, status: status || 'ожидается', startedAt: '', endedAt: '' }, extra || {});
const shown = (r) => (r.lower.getTime() === r.upper.getTime() ? hm(r.lower) : hm(r.lower) + '–' + hm(r.upper));

test('37: цепочка прогноза 14.45, 15.10, 15.35', () => {
  const res = g.forecastDoctorDay_([
    A('p', 14, 0, 'состоялся', { startedAt: T(14, 20), endedAt: T(14, 45) }),
    A('a', 14, 30), A('b', 15, 0), A('c', 15, 30),
  ], null, T(14, 45));
  assert.deepStrictEqual(['a', 'b', 'c'].map((k) => hm(res[k].forecast)), ['14.45', '15.10', '15.35']);
});

test('38: приём ещё идёт — прогноз следующего = сейчас', () => {
  const res = g.forecastDoctorDay_([A('p', 14, 0, 'идёт', { startedAt: T(14, 0) }), A('a', 14, 30)], null, T(14, 40));
  assert.strictEqual(hm(res.a.forecast), '14.40');
});

test('39: округление вверх, границы кратны 5', () => {
  assert.strictEqual(hm(g.ceilTo_(T(14, 37), 5)), '14.40');
  assert.strictEqual(hm(g.ceilTo_(T(14, 35), 5)), '14.35');
  assert.strictEqual(hm(g.ceilTo_(new Date(2026, 10, 21, 14, 35, 20), 5)), '14.40');
});

test('40: сдвиг интервала 14.30–14.40 → 14.35–14.45 → 14.40–14.50', () => {
  const day = (now) => g.forecastDoctorDay_([A('p', 14, 0, 'идёт', { startedAt: T(14, 0) }), A('a', 14, 30)], null, now).a;
  assert.strictEqual(shown(day(T(14, 26))), '14.30–14.40', 'Б6: предыдущий не закончился к 14.25');
  assert.strictEqual(shown(day(T(14, 34))), '14.35–14.45');
  assert.strictEqual(shown(day(T(14, 39))), '14.40–14.50');
});

test('41: обед — задержка 20 минут переходит через обед', () => {
  const res = g.forecastDoctorDay_([
    A('p', 10, 30, 'состоялся', { startedAt: T(10, 50), endedAt: T(11, 15) }), // закончился на 20 минут позже
    A('a', 12, 0),
  ], 11 * 60, T(11, 15));
  assert.strictEqual(hm(res.a.forecast), '12.20');
});

test('8, 9: сдвиг до 5 минут — точное время, больше 5 — интервал', () => {
  const at = T(14, 0), now = T(13, 30), prev = null;
  assert.strictEqual(shown(g.interval_(at, T(14, 5), now, prev)), '14.00');
  assert.strictEqual(shown(g.interval_(at, T(14, 6), now, prev)), '14.00–14.10');
});

test('9: ширина интервала 10 / 15 / 30', () => {
  assert.deepStrictEqual([59, 60, 120, 121].map(g.intervalWidth_), [10, 15, 15, 30]);
});

test('10: нижняя граница не раньше назначенного (примеры из теста)', () => {
  const now = T(11, 30); // до приёма больше 120 минут → ширина 30
  assert.strictEqual(shown(g.interval_(T(14, 0), T(14, 20), now, null)), '14.00–14.20');
  assert.strictEqual(shown(g.interval_(T(14, 0), T(14, 40), now, null)), '14.10–14.40');
});

test('11: время раньше назначенного не показывается никогда (1000 случайных случаев)', () => {
  for (let i = 0; i < 1000; i++) {
    const at = T(9 + Math.floor(Math.random() * 7), 30 * Math.floor(Math.random() * 2));
    const f = new Date(at.getTime() + Math.floor(Math.random() * 90) * 60000);
    const now = new Date(at.getTime() - Math.floor(Math.random() * 200 - 30) * 60000);
    const r = g.interval_(at, f, now, { done: false, going: Math.random() < 0.5, plannedEnd: at });
    assert.ok(r.lower >= at && r.upper >= r.lower);
  }
});

test('36: врач освободился раньше — назначенное время, без опережения', () => {
  const res = g.forecastDoctorDay_([
    A('p', 14, 0, 'состоялся', { startedAt: T(14, 0), endedAt: T(14, 15) }), A('a', 14, 30),
  ], null, T(14, 16));
  assert.strictEqual(shown(res.a), '14.30');
});

test('отменённые и неявки в цепочку не входят', () => {
  const res = g.forecastDoctorDay_([A('x', 14, 0, 'неявка'), A('a', 14, 30)], null, T(14, 10));
  assert.strictEqual(shown(res.a), '14.30');
});

test('14: пересчёт на 2-й минуте, публикация на 3-й, цикл 3 минуты', () => {
  const s = (h, m) => JSON.parse(JSON.stringify(g.cycleStep_(T(h, m), 8 * 60)));
  assert.deepStrictEqual(s(8, 1), { recalc: -1, publish: -1 });
  assert.deepStrictEqual(s(8, 2), { recalc: 0, publish: -1 });
  assert.deepStrictEqual(s(8, 3), { recalc: 0, publish: 0 });
  assert.deepStrictEqual(s(8, 5), { recalc: 1, publish: 0 });
  assert.deepStrictEqual(s(8, 6), { recalc: 1, publish: 1 });
});

test('22: интервал и «задерживается» на странице, Х — нижняя граница', () => {
  const v = g.buildPatientView_({
    number: 47, doctor: 'Смирнова Е. В.', department: 'Кардиология', at: T(12, 0), status: 'ожидается',
    startedAt: '', shownLower: T(12, 10), shownUpper: T(12, 20),
  }, T(11, 30));
  assert.strictEqual(v.timeText, '12.10–12.20');
  assert.strictEqual(v.message, 'Сегодня приём у врача Смирнова Е. В. задерживается. Приходите к 12.10');
});

test('страница «Проверки»: все примеры этапа 3 проходят', () => {
  const res = g.forecastChecks_();
  for (const r of res) assert.strictEqual(r.status, 'прошёл', 'тест ' + r.num + ': ' + r.details);
  assert.strictEqual(JSON.stringify(res.map((r) => r.num)), JSON.stringify([8, 9, 10, 11, 14, 36, 37, 38, 39, 40, 41]));
});

test('34: заглушка — 6 минут без публикации в часы работы', () => {
  const h = loadSrc();
  let published = null;
  h.PropertiesService = { getScriptProperties: () => ({ getProperty: () => published }) };
  h.readSetting_ = (name) => ({ 'Открытие клиники': '08:00', 'Закрытие клиники': '17:00' }[name] || '');
  published = String(T(10, 0).getTime());
  assert.strictEqual(h.isStale_(T(10, 5)), false, '5 минут — ещё свежо');
  assert.strictEqual(h.isStale_(T(10, 6)), true, '6 минут — заглушка');
  published = String(T(7, 0).getTime());   // вчерашняя/утренняя публикация — считаем от открытия
  assert.strictEqual(h.isStale_(T(8, 3)), false);
  assert.strictEqual(h.isStale_(T(8, 6)), true);
  assert.strictEqual(h.isStale_(T(17, 30)), false, 'клиника закрыта — заглушки нет');
});
