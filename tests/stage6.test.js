// Проверки модуля врача на компьютере. Запуск: node --test tests
const test = require('node:test');
const assert = require('node:assert');
const { loadSrc } = require('./load');

const g = loadSrc();
const T = (hh, mm) => new Date(2026, 10, 21, hh, mm);
const hm = (d) => d.getHours() + '.' + String(d.getMinutes()).padStart(2, '0');
const A = (key, hh, mm, extra) => Object.assign({
  key, at: T(hh, mm), duration: 25, status: 'ожидается', arrivedAt: '', startedAt: '', endedAt: '',
  cardOpenedAt: '', cardClosedAt: '', lateRef: '', shownLower: '', shownUpper: '', doctor: 'Врач',
}, extra || {});
const plain = (x) => JSON.parse(JSON.stringify(x));

test('1: врач видит окно только для пришедших', () => {
  assert.strictEqual(g.startDue_(A('a', 12, 0), null), null);
  assert.strictEqual(g.doctorWindow_([A('a', 12, 0)], T(12, 30)), null);
});

test('2: окно «Начался ли приём?» — в назначенное время, через 2 минуты после прихода или при открытии карты', () => {
  assert.strictEqual(hm(g.startDue_(A('a', 12, 0, { status: 'пришёл', arrivedAt: T(11, 58) }), null)), '12.00');
  assert.strictEqual(hm(g.startDue_(A('a', 12, 0, { status: 'пришёл', arrivedAt: T(11, 59) }), null)), '12.01');
  assert.strictEqual(hm(g.startDue_(A('a', 12, 0, { status: 'пришёл', arrivedAt: T(11, 50), cardOpenedAt: T(11, 53) }), null)), '11.53');
});

test('3: пока предыдущий не закрыт — окна нет; после закрытия — через 1 минуту', () => {
  const going = A('p', 11, 30, { status: 'идёт', arrivedAt: T(11, 25), startedAt: T(11, 35) });
  const next = A('a', 12, 0, { status: 'пришёл', arrivedAt: T(11, 50) });
  const w = g.doctorWindow_([going, next], T(12, 2));
  assert.strictEqual(w.type, 'end', 'сначала «Приём окончен?» по идущему');
  const done = Object.assign({}, going, { status: 'состоялся', endedAt: T(12, 10) });
  assert.strictEqual(g.doctorWindow_([done, next], T(12, 10)), null, 'в 12.10 ещё рано');
  const w2 = g.doctorWindow_([done, next], T(12, 11));
  assert.strictEqual(w2.key, 'a');
  assert.strictEqual(hm(w2.due), '12.11');
});

test('4, 5: нет ответа → напоминание через 5 минут → регистратура ещё через 5', () => {
  const due = T(12, 0);
  assert.deepStrictEqual([T(11, 59), T(12, 0), T(12, 4), T(12, 5), T(12, 9), T(12, 10)].map((n) => g.windowStage_(due, n)),
    ['wait', 'ask', 'ask', 'remind', 'remind', 'registry']);
});

test('5: «Приём окончен?» — в запланированное окончание или при закрытии карты', () => {
  const going = A('p', 12, 0, { status: 'идёт', arrivedAt: T(11, 55), startedAt: T(12, 0) });
  assert.strictEqual(g.doctorWindow_([going], T(12, 24)), null);
  assert.strictEqual(hm(g.doctorWindow_([going], T(12, 25)).due), '12.25');
  const closed = Object.assign({}, going, { cardClosedAt: T(12, 18) });
  assert.strictEqual(hm(g.doctorWindow_([closed], T(12, 18)).due), '12.18');
});

test('6: запланированное окончание — вовремя / опоздал без задержки / опоздал с задержкой', () => {
  const onTime = A('a', 12, 0, { status: 'идёт', arrivedAt: T(11, 30), startedAt: T(11, 40) });
  assert.strictEqual(hm(g.plannedEnd_(onTime, false)), '12.05', '6.1: от фактического начала (решение А7)');
  const late = A('a', 12, 0, { status: 'идёт', arrivedAt: T(12, 10), startedAt: T(12, 12) });
  assert.strictEqual(hm(g.plannedEnd_(late, false)), '12.30', '6.2: назначенное + 5 + 25');
  const lateDelay = A('a', 12, 0, { status: 'идёт', arrivedAt: T(12, 30), startedAt: T(12, 31), lateRef: T(12, 20) });
  assert.strictEqual(hm(g.plannedEnd_(lateDelay, true)), '12.50', '6.3: верхняя граница + 5 + 25');
});

test('7: пришёл раньше, врач свободен — окно при открытии карты, прогноз следующих не меняется', () => {
  const early = A('a', 14, 0, { status: 'пришёл', arrivedAt: T(13, 30), cardOpenedAt: T(13, 31) });
  const w = g.doctorWindow_([early], T(13, 31));
  assert.strictEqual(w.type, 'start');
  assert.strictEqual(hm(w.due), '13.31');
  const started = Object.assign({}, early, { status: 'идёт', startedAt: T(13, 31) });
  assert.strictEqual(hm(g.plannedEnd_(started, false)), '13.56');
  const res = g.forecastDoctorDay_([started, A('n', 14, 30)], null, T(13, 35));
  assert.strictEqual(hm(res.n.forecast), '14.30');
});

test('16: задержка — 3 приёма подряд закончились на 20+ минут позже расписания; снимается, когда время снова точное', () => {
  const done = (key, hh, mm) => A(key, hh, mm, { status: 'состоялся', arrivedAt: T(hh, mm - 5 < 0 ? 0 : mm), startedAt: new Date(T(hh, mm).getTime() + 20 * 60000), endedAt: new Date(T(hh, mm).getTime() + 45 * 60000) });
  const three = [done('a', 9, 0), done('b', 9, 30), done('c', 10, 0)];
  const nextInterval = A('d', 10, 30, { shownLower: T(10, 50), shownUpper: T(11, 0) });
  assert.strictEqual(g.doctorDelay_([three[0], three[1], nextInterval]), false, 'двух мало');
  assert.strictEqual(g.doctorDelay_(three.concat([nextInterval])), true);
  assert.strictEqual(g.doctorDelay_(three.concat([A('d', 10, 30)])), false, 'у следующего точное время — задержка снята');
});

test('23: автоматическая неявка — только если следующий начат не раньше своего времени', () => {
  const absent = A('x', 12, 0);
  const arrivedWaiting = A('y', 12, 30, { status: 'пришёл', arrivedAt: T(12, 20) });
  const started = A('z', 13, 0, { status: 'идёт', arrivedAt: T(12, 50), startedAt: T(13, 0) });
  assert.deepStrictEqual(plain(g.autoNoShows_([absent, arrivedWaiting, started], started)), ['x']);
  const early = Object.assign({}, started, { startedAt: T(12, 55) });
  assert.deepStrictEqual(plain(g.autoNoShows_([absent, started], early)), [], 'начат раньше — неявку не ставим (решение А2)');
});

test('46: вопрос без ответа 10 минут уходит в регистратуру', () => {
  const a = A('a', 12, 0, { status: 'пришёл', arrivedAt: T(11, 50) });
  assert.strictEqual(g.doctorWindow_([a], T(12, 10)).stage, 'registry');
  const opts = plain(g.answerTimeOptions_(T(12, 0), T(12, 12)));
  assert.strictEqual(opts[0], '11:30');
  assert.strictEqual(opts[opts.length - 1], '12:10');
});

test('страница «Проверки»: все примеры этапа 6 проходят', () => {
  for (const r of g.doctorChecks_()) assert.strictEqual(r.status, 'прошёл', 'тест ' + r.num + ': ' + r.details);
});
