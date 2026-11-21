// Проверки SMS-модуля на компьютере. Запуск: node --test tests
const test = require('node:test');
const assert = require('node:assert');
const { loadSrc } = require('./load');

const g = loadSrc();
const D = (d, hh, mm) => new Date(2026, 10, d, hh || 0, mm || 0);   // ноябрь 2026
const T = (hh, mm) => D(21, hh, mm);                                 // суббота 21.11
const plain = (x) => JSON.parse(JSON.stringify(x));
const A = (token, hh, mm, extra) => Object.assign({
  token, number: 47, doctor: 'Смирнова Е. В.', department: 'Кардиология', at: T(hh, mm), duration: 25,
  status: 'ожидается', arrivedAt: '', startedAt: '', endedAt: '', lateRef: '', shownLower: '', shownUpper: '',
  cardOpenedAt: '', cardClosedAt: '', createdAt: D(14, 9),
}, extra || {});
const plan = (created, at) => plain(g.smsReminderPlan_(created, at)).map((r) => r.type + ' ' + new Date(r.sendAt).getDate() + '.' + new Date(r.sendAt).getHours());

test('15: напоминания в 10.00 — день в день и за 1 день нет; за 2–3 дня — за 1 день; за 4+ — оба', () => {
  const at = D(25, 10, 0);
  assert.deepStrictEqual(plan(D(25, 8), at), [], 'день в день');
  assert.deepStrictEqual(plan(D(24, 12), at), [], 'за 1 день: напоминание пришлось бы на день записи');
  assert.deepStrictEqual(plan(D(23, 12), at), ['напоминание за 1 день 24.10'], 'за 2 дня');
  assert.deepStrictEqual(plan(D(22, 9), at), ['напоминание за 1 день 24.10'], 'за 3 дня: «за 3 дня» в день записи — не шлём');
  assert.deepStrictEqual(plan(D(21, 9), at), ['напоминание за 3 дня 22.10', 'напоминание за 1 день 24.10'], 'за 4 дня');
});

test('15: напоминание уходит в 10.00 своего дня, не раньше и не задним числом', () => {
  const a = A('r', 10, 0, { at: D(23, 10, 0), createdAt: D(18, 9) });   // приём 23.11, напоминание за 1 день — 22.11 10.00
  assert.deepStrictEqual(plain(g.dueSms_([a], D(22, 9, 59))), []);
  assert.deepStrictEqual(plain(g.dueSms_([a], D(22, 10, 0))), [{ token: 'r', type: 'напоминание за 1 день' }]);
  assert.deepStrictEqual(plain(g.dueSms_([a], D(23, 9, 0))), [], 'на следующий день старое напоминание не шлём');
});

test('16: без задержки SMS о задержке нет', () => {
  const list = [A('a', 13, 0)];
  assert.deepStrictEqual(plain(g.dueSms_(list, T(12, 0))), []);
});

test('17: при задержке — пациентам врача, у кого до приёма от 30 до 120 минут', () => {
  const done = (k, h) => A(k, h, 0, { status: 'состоялся', arrivedAt: T(h - 1, 55), startedAt: T(h, 20), endedAt: T(h, 45) });
  const base = [done('d1', 9), done('d2', 10), done('d3', 11),
    A('next', 12, 0, { shownLower: T(12, 20), shownUpper: T(12, 30) })];
  const n = T(11, 50);
  const list = base.concat([A('m25', 12, 15), A('m30', 12, 20), A('m120', 13, 50), A('m125', 13, 55)]);
  const delay = plain(g.dueSms_(list, n)).filter((d) => d.type === 'задержка').map((d) => d.token).sort();
  assert.deepStrictEqual(delay, ['m120', 'm30']);
});

test('18: одно SMS о задержке на приём — ключ повторяется, после переноса — новый', () => {
  assert.strictEqual(g.smsKey_('X', 'задержка', T(12, 0)), g.smsKey_('X', 'задержка', T(12, 0)));
  assert.notStrictEqual(g.smsKey_('X', 'задержка', T(12, 0)), g.smsKey_('X', 'задержка', D(25, 10)));
});

test('21: опоздание 20+ минут — SMS, даже если пациент входит в эту минуту', () => {
  assert.deepStrictEqual(plain(g.dueSms_([A('a', 12, 0)], T(12, 19))), []);
  assert.deepStrictEqual(plain(g.dueSms_([A('a', 12, 0)], T(12, 20))), [{ token: 'a', type: 'опоздание' }]);
  const entering = A('a', 12, 0, { status: 'пришёл', arrivedAt: T(12, 20) });
  assert.deepStrictEqual(plain(g.dueSms_([entering], T(12, 20))), [{ token: 'a', type: 'опоздание' }]);
  const cameEarlier = A('a', 12, 0, { status: 'пришёл', arrivedAt: T(12, 15) });
  assert.deepStrictEqual(plain(g.dueSms_([cameEarlier], T(12, 20))), [], 'пришёл до 20 минут — SMS нет');
});

test('42, 44: в тексте — номер в очереди и полная ссылка, без телефона', () => {
  const a = A('TOK', 12, 0, { at: D(25, 10, 0) });
  const link = g.patientLink_('TOK');
  const c = g.smsText_('подтверждение записи', a, link, '10.00');
  assert.strictEqual(c.text, 'Вы записаны к врачу Смирнова Е. В. на 25.11.2026 в 10.00. Ваш номер 47. ' +
    'Отслеживайте статус в очереди в реальном времени ' + link);
  assert.ok(link.startsWith('https://script.google.com/') && link.endsWith('?t=TOK'));
  const r = g.smsText_('напоминание за 1 день', a, link, '10.00');
  assert.strictEqual(r.text, 'Напоминаем о записи к доктору Смирнова Е. В. в 25.11.2026 10.00. Ваш номер 47. ' +
    'Отслеживайте статус в очереди в реальном времени ' + link);
  for (const type of ['подтверждение записи', 'напоминание за 3 дня', 'опоздание', 'задержка']) {
    const m = g.smsText_(type, a, link, '12.40–12.50');
    assert.ok(m.subject && m.text.includes(link));
    assert.ok(!/\d{3}-\d{4}/.test(m.text), 'нет номера телефона');
  }
});

test('страница «Проверки»: примеры SMS проходят', () => {
  const h = loadSrc();
  h.readRows_ = () => [];   // живой журнал пуст — проверяем только примеры (15–18, 21)
  const res = h.smsChecks_([]).filter((r) => [15, 16, 17, 18, 21].includes(r.num));
  assert.strictEqual(res.length, 5);
  for (const r of res) assert.strictEqual(r.status, 'прошёл', 'тест ' + r.num + ': ' + r.details);
});
