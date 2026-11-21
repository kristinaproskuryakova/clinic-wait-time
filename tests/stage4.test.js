// Проверки экрана отделения на компьютере. Запуск: node --test tests
const test = require('node:test');
const assert = require('node:assert');
const { loadSrc } = require('./load');

const g = loadSrc();
const T = (hh, mm) => new Date(2026, 10, 21, hh, mm);
const A = (number, doctor, hh, mm, status, extra) => Object.assign({
  number, doctor, department: 'Кардиология', at: T(hh, mm), status: status || 'ожидается',
  startedAt: '', shownLower: '', shownUpper: '',
}, extra || {});
const CAB = { 'Смирнова Е. В.': '201', 'Кузнецов Д. И.': '202' };
const plain = (x) => JSON.parse(JSON.stringify(x));

test('12: только ближайшие два часа; дальше — нет', () => {
  const items = g.screenItems_([A(1, 'Смирнова Е. В.', 12, 0), A(2, 'Смирнова Е. В.', 13, 30), A(3, 'Смирнова Е. В.', 14, 0)], CAB, T(12, 0));
  assert.deepStrictEqual(plain(items).map((i) => i.number), [1, 2], '14.00 ровно через два часа — уже не показываем');
});

test('12: «Приём идёт» — первым; состоялся, отменён и другое отделение — не показываются', () => {
  const items = g.screenItems_([
    A(5, 'Смирнова Е. В.', 12, 30),
    A(4, 'Кузнецов Д. И.', 11, 30, 'идёт', { startedAt: T(11, 35) }),
    A(6, 'Смирнова Е. В.', 11, 30, 'состоялся'),
    A(7, 'Смирнова Е. В.', 12, 0, 'отменён'),
    A(8, 'Иванова А. С.', 12, 0),
  ], CAB, T(12, 0));
  assert.deepStrictEqual(plain(items), [
    { number: 4, timeText: 'Приём идёт', cabinet: '202', kind: 'in_progress' },
    { number: 5, timeText: '12.30', cabinet: '201', kind: 'today' },
  ]);
});

test('11, 13: интервал на экране такой же, как на странице, и не раньше назначенного', () => {
  const a = A(9, 'Смирнова Е. В.', 12, 30, 'ожидается', { shownLower: T(12, 40), shownUpper: T(12, 50) });
  const [item] = g.screenItems_([a], CAB, T(12, 10));
  assert.strictEqual(item.timeText, '12.40–12.50');
  assert.strictEqual(item.timeText, g.buildPatientView_(a, T(12, 10)).timeText);
});

test('опоздавший (прошла граница «вовремя» +5 минут) с экрана убирается', () => {
  const a = A(10, 'Смирнова Е. В.', 12, 0);
  assert.strictEqual(g.screenItems_([a], CAB, T(12, 5)).length, 1, '12.05 — ещё вовремя');
  assert.strictEqual(g.screenItems_([a], CAB, T(12, 6)).length, 0, '12.06 — уже опоздал');
  const late = A(11, 'Смирнова Е. В.', 12, 0, 'ожидается', { shownLower: T(12, 10), shownUpper: T(12, 20) });
  assert.strictEqual(g.screenItems_([late], CAB, T(12, 24)).length, 1, 'с интервалом — до верхней границы + 5');
});

test('34, 35: экран — заглушка, выключен вне часов, неизвестное отделение', () => {
  const h = loadSrc();
  h.readRows_ = (name) => (name === 'Врачи' ? [['Смирнова Е. В.', 'Кардиология', '201', '12:00']] : []);
  let n = T(12, 0), stale = false, working = true;
  h.now_ = () => n; h.isStale_ = () => stale; h.isWorkingTime_ = () => working;
  assert.strictEqual(h.getScreenView('Кардиология').state, 'ok');
  stale = true;
  assert.strictEqual(h.getScreenView('Кардиология').state, 'stale');
  working = false;
  assert.strictEqual(h.getScreenView('Кардиология').state, 'closed');
  assert.strictEqual(h.getScreenView('Хирургия').state, 'unknown');
});

test('12: на экране — по показанному времени: пациент на 8.00, показанный на 14.10, в 11.25 не попадает', () => {
  const early = A(50, 'Смирнова Е. В.', 8, 0, 'ожидается', { shownLower: T(14, 10), shownUpper: T(14, 20) });
  const soon = A(43, 'Смирнова Е. В.', 8, 30, 'ожидается', { shownLower: T(11, 40), shownUpper: T(11, 50) });
  const items = g.screenItems_([early, soon], CAB, T(11, 25));
  assert.deepStrictEqual(plain(items).map((i) => i.number), [43]);
  assert.strictEqual(g.screenItems_([early], CAB, T(12, 11)).length, 1, 'за два часа до 14.10 — появляется');
});
