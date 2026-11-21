// Проверки логики этапа 2 (страница пациента) на компьютере. Запуск: node --test tests
const test = require('node:test');
const assert = require('node:assert');
const { loadSrc } = require('./load');

const g = loadSrc();
const NOW = new Date(2026, 10, 21, 10, 0); // суббота 21.11.2026, 10:00

function appt(over) {
  return Object.assign({
    number: 47, doctor: 'Иванова А. С.', department: 'Терапия',
    at: new Date(2026, 10, 21, 12, 0), status: 'ожидается', startedAt: '',
  }, over);
}

test('22: в день приёма по плану', () => {
  const v = g.buildPatientView_(appt(), NOW);
  assert.strictEqual(v.message, 'Ваш приём назначен на 12.00, приходите вовремя');
  assert.strictEqual(v.timeText, '12.00');
  assert.strictEqual(v.dateText, 'Сегодня');
});

test('22, 14-Б: «пришёл» пациент видит так же, как «ожидается»', () => {
  assert.deepStrictEqual(g.buildPatientView_(appt({ status: 'пришёл' }), NOW),
    g.buildPatientView_(appt(), NOW));
});

test('22, 35: до дня приёма — дата и время', () => {
  const v = g.buildPatientView_(appt({ at: new Date(2026, 10, 25, 9, 30) }), NOW);
  assert.strictEqual(v.kind, 'before_day');
  assert.strictEqual(v.dateText, '25.11.2026');
  assert.strictEqual(v.timeText, '9.30');
  assert.strictEqual(v.message, '');
});

test('35: с 00:00 дня приёма — время и статус', () => {
  const v = g.buildPatientView_(appt(), new Date(2026, 10, 21, 0, 5));
  assert.strictEqual(v.message, 'Ваш приём назначен на 12.00, приходите вовремя');
});

test('22: идёт, состоялся, отменён, неявка', () => {
  assert.strictEqual(g.buildPatientView_(appt({ status: 'идёт' }), NOW).message, 'Ваш приём идёт');
  assert.strictEqual(g.buildPatientView_(appt({ status: 'состоялся', startedAt: new Date(2026, 10, 21, 12, 5) }), NOW).message,
    'Приём состоялся 21.11.2026 в 12.05');
  assert.strictEqual(g.buildPatientView_(appt({ status: 'отменён' }), NOW).message, 'Приём отменён');
  assert.strictEqual(g.buildPatientView_(appt({ status: 'неявка' }), NOW).message, 'Приём отменён');
});

test('22: перенесён на Х, осталось Х', () => {
  const v = g.buildPatientView_(appt({ status: 'перенесён', at: new Date(2026, 10, 25, 10, 0) }), NOW);
  assert.strictEqual(v.message, 'Перенесён на 25.11.2026 в 10.00, осталось 4 дня');
  const one = g.buildPatientView_(appt({ status: 'перенесён', at: new Date(2026, 10, 22, 10, 0) }), NOW);
  assert.match(one.message, /осталось 1 день$/);
  const five = g.buildPatientView_(appt({ status: 'перенесён', at: new Date(2026, 10, 26, 10, 0) }), NOW);
  assert.match(five.message, /осталось 5 дней$/);
});

test('27: в ответе только номер, врач, отделение, время и статус', () => {
  const v = g.buildPatientView_(appt(), NOW);
  assert.deepStrictEqual(Object.keys(v).sort(),
    ['dateText', 'department', 'doctor', 'kind', 'message', 'number', 'timeText']);
});

// Заглушки сервисов Google для getPatientView.
function setupServer() {
  const store = {};
  g.CacheService = { getScriptCache: () => ({
    get: (k) => (k in store ? store[k] : null),
    put: (k, v) => { store[k] = v; },
  }) };
  const good = g.generateToken_();
  g.findAppointment_ = (t) => (t === good ? appt() : null);
  g.now_ = () => NOW;
  g.isStale_ = () => false; // публикация свежая (заглушка проверяется в этапе 3)
  return good;
}

test('29, 31: 5 неверных токенов → «недействительна», 6-я попытка → блокировка', () => {
  const good = setupServer();
  for (let i = 0; i < 5; i++) {
    const res = g.getPatientView(g.generateToken_(), 'device-aaaa1111');
    assert.strictEqual(res.state, 'invalid');
    assert.strictEqual(res.view, undefined, 'никаких данных о записи');
  }
  assert.strictEqual(g.getPatientView(g.generateToken_(), 'device-aaaa1111').state, 'blocked');
  assert.strictEqual(g.getPatientView(good, 'device-aaaa1111').state, 'blocked', 'блок и для правильной ссылки');
  assert.strictEqual(g.getPatientView(good, 'device-bbbb2222').state, 'ok', 'другое устройство не заблокировано');
});

test('правильный токен → данные приёма; мусор в ссылке → недействительна', () => {
  const good = setupServer();
  assert.strictEqual(g.getPatientView(good, 'device-cccc3333').view.number, 47);
  assert.strictEqual(g.getPatientView('<script>', 'device-cccc3333').state, 'invalid');
  assert.strictEqual(g.cleanToken_('ABC<script>"x'), 'ABCscriptx');
});

test('внутренние функции закрыты от вызова со страницы', () => {
  // Открытые: точки входа Google (doGet, onOpen, onEdit, onTimer), пункты меню (работают только из таблицы),
  // getPatientView (отдаёт один приём по токену) и pultAction (без ключа служебных страниц не работает).
  const allowed = ['doGet', 'onOpen', 'onEdit', 'onTimer', 'setupSheets', 'getPatientView', 'pultAction',
    'menuCreateDemoDay', 'menuSyncFromBookings', 'menuShowStaffLinks', 'menuShowPatientLink',
    'menuDemoDelay', 'menuInstallTimer'];
  const fresh = loadSrc();
  const open = Object.keys(fresh).filter((k) => typeof fresh[k] === 'function' && !k.endsWith('_'));
  assert.deepStrictEqual(open.sort(), allowed.sort());
});

test('статус: не важны регистр, пробелы и «ё»/«е»; неизвестный → пусто', () => {
  for (const s of ['перенесён', 'перенесен', ' Перенесен ', 'ПЕРЕНЕСЁН']) {
    assert.strictEqual(g.normalizeStatus_(s), 'перенесён', s);
  }
  assert.strictEqual(g.normalizeStatus_('отменен'), 'отменён');
  assert.strictEqual(g.normalizeStatus_('Идет'), 'идёт');
  assert.strictEqual(g.normalizeStatus_('пришел'), 'пришёл');
  assert.strictEqual(g.normalizeStatus_('перенсён'), '');
  assert.ok(g.isOpenStatus_('Перенесен'));
  assert.ok(!g.isOpenStatus_('отменен'));
});

test('перенос на другое время того же дня — как обычный приём', () => {
  const v = g.buildPatientView_(appt({ status: 'перенесён', at: new Date(2026, 10, 21, 15, 0) }), NOW);
  assert.strictEqual(v.message, 'Ваш приём назначен на 15.00, приходите вовремя');
});
