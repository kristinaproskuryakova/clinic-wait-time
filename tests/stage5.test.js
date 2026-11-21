// Проверки опоздания и регистратуры на компьютере. Запуск: node --test tests
const test = require('node:test');
const assert = require('node:assert');
const { loadSrc } = require('./load');

const g = loadSrc();
const T = (hh, mm) => new Date(2026, 10, 21, hh, mm);
const A = (extra) => Object.assign({
  number: 47, doctor: 'Смирнова Е. В.', department: 'Кардиология', at: T(12, 0), status: 'ожидается',
  startedAt: '', shownLower: '', shownUpper: '', arrivedAt: '', lateRef: '',
}, extra || {});
const LATE = 'Похоже, вы опаздываете на прием к врачу Смирнова Е. В., назначенный на 12.00 21.11.2026. ' +
  'Прием может быть сокращен. Вы можете перенести запись на более удобное для вас время';

test('19: пришёл до назначенного + 5 минут — опоздания нет, обычный текст', () => {
  const a = A({ status: 'пришёл', arrivedAt: T(12, 5) });
  assert.strictEqual(g.isLateArrival_(a), false);
  assert.strictEqual(g.buildPatientView_(a, T(12, 6)).message, 'Ваш приём назначен на 12.00, приходите вовремя');
});

test('19: с интервалом граница — верхняя граница + 5 минут', () => {
  const a = A({ status: 'пришёл', arrivedAt: T(12, 24), shownLower: T(12, 10), shownUpper: T(12, 20) });
  assert.strictEqual(g.isLateArrival_(a), false);
  assert.strictEqual(g.isLateArrival_(Object.assign({}, a, { arrivedAt: T(12, 26) })), true);
});

test('20, Б10: пришёл позже границы — текст об опоздании', () => {
  const a = A({ status: 'пришёл', arrivedAt: T(12, 6) });
  assert.strictEqual(g.buildPatientView_(a, T(12, 7)).message, LATE);
});

test('20, Б10: не пришёл, граница прошла — тот же текст', () => {
  const v = g.buildPatientView_(A(), T(12, 6));
  assert.strictEqual(v.kind, 'late');
  assert.strictEqual(v.message, LATE);
  assert.strictEqual(g.buildPatientView_(A(), T(12, 5)).kind, 'today', '12.05 — ещё вовремя');
});

test('решение 2: граница фиксируется и дальше не двигается', () => {
  // Опорное время зафиксировано 12.00; интервал потом сдвинулся до 12.40 — опоздание всё равно от 12.00.
  const a = A({ lateRef: T(12, 0), shownLower: T(12, 30), shownUpper: T(12, 40) });
  assert.strictEqual(g.isAbsentLate_(a, T(12, 10)), true);
  assert.strictEqual(g.isLate20_(a, T(12, 20)), true);
});

test('46: опоздание 20+ минут — от верхней границы интервала или назначенного времени', () => {
  assert.strictEqual(g.isLate20_(A(), T(12, 19)), false);
  assert.strictEqual(g.isLate20_(A(), T(12, 20)), true);
  const withInterval = A({ shownLower: T(12, 10), shownUpper: T(12, 20) });
  assert.strictEqual(g.isLate20_(withInterval, T(12, 39)), false);
  assert.strictEqual(g.isLate20_(withInterval, T(12, 40)), true);
  assert.strictEqual(g.isLate20_(A({ arrivedAt: T(12, 30), status: 'пришёл' }), T(12, 40)), false, 'пришёл — не подсвечиваем');
  assert.strictEqual(g.isLate20_(A({ status: 'отменён' }), T(12, 40)), false);
});

test('решение 1: не пришедший к границе «вовремя» не занимает место в прогнозе', () => {
  const P = (key, hh, mm, extra) => Object.assign({ key, at: T(hh, mm), duration: 25, status: 'ожидается', startedAt: '', endedAt: '' }, extra || {});
  const res = g.forecastDoctorDay_([
    P('p', 11, 30, { status: 'состоялся', startedAt: T(11, 30), endedAt: T(11, 55) }),
    P('absent', 12, 0, { skip: true }),
    P('next', 12, 30),
  ], null, T(12, 10));
  assert.strictEqual(res.absent, undefined);
  assert.strictEqual(res.next.forecast.getTime(), T(12, 30).getTime(), 'следующему время не сдвигается');
});

test('экран: опоздавший, но пришедший — на экране со своим временем, без пометки об опоздании', () => {
  const a = A({ status: 'пришёл', arrivedAt: T(12, 8) });
  const [item] = JSON.parse(JSON.stringify(g.screenItems_([a], { 'Смирнова Е. В.': '201' }, T(12, 9))));
  assert.deepStrictEqual(item, { number: 47, timeText: '12.00', cabinet: '201', kind: 'today' });
  assert.strictEqual(g.screenItems_([A()], { 'Смирнова Е. В.': '201' }, T(12, 9)).length, 0, 'не пришёл и опоздал — убран');
});

test('перенос: окна записи 8.00–16.30 и запреты (прошлое, воскресенье, вне часов)', () => {
  const h = loadSrc();
  h.openTime_ = () => '08:00';
  h.closeTime_ = () => '17:00';
  const slots = JSON.parse(JSON.stringify(h.bookingSlots_()));
  assert.strictEqual(slots[0], '08:00');
  assert.strictEqual(slots[slots.length - 1], '16:30');
  assert.strictEqual(slots.length, 18);
  const now = T(12, 0); // суббота 21.11.2026
  assert.strictEqual(h.rescheduleProblem_(new Date(2026, 10, 23, 10, 0), now), '', 'понедельник 10.00 — можно');
  assert.match(h.rescheduleProblem_(T(11, 0), now), /прошло/);
  assert.match(h.rescheduleProblem_(new Date(2026, 10, 22, 10, 0), now), /воскресенье/);
  assert.match(h.rescheduleProblem_(new Date(2026, 10, 23, 17, 0), now), /вне часов/);
  assert.match(h.rescheduleProblem_(null, now), /Выбери/);
});
