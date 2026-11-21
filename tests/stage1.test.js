// Проверки логики этапа 1 на компьютере (без Google). Запуск: node --test tests
const test = require('node:test');
const assert = require('node:assert');
const { loadSrc } = require('./load');

const g = loadSrc();

test('все файлы src без синтаксических ошибок', () => {
  assert.ok(typeof g.doGet === 'function');
});

test('28: токен — 20 символов из алфавита', () => {
  for (let i = 0; i < 1000; i++) {
    const t = g.generateToken();
    assert.strictEqual(t.length, 20);
    assert.ok(g.isTokenFormat(t), t);
  }
  assert.ok(!g.isTokenFormat('ABC'));
  assert.ok(!g.isTokenFormat('O'.repeat(20)), 'буква O не из алфавита');
});

test('30: случайные токены разные и не похожи друг на друга', () => {
  const tokens = Array.from({ length: 5000 }, () => g.generateToken());
  assert.strictEqual(new Set(tokens).size, tokens.length);
  let alike = 0;
  for (let i = 1; i < tokens.length; i++) if (g.tokensLookAlike(tokens[i - 1], tokens[i])) alike++;
  assert.ok(alike <= 1, 'похожих пар: ' + alike);
  assert.ok(g.tokensLookAlike('ABCDEFGHJKLMNPQRSTUV', 'ABCXXXXXXXXXXXXXXXXX'), 'общее начало из 3');
});

test('42: наименьший свободный номер', () => {
  assert.strictEqual(g.lowestFreeNumber([], 999), 1);
  assert.strictEqual(g.lowestFreeNumber([1, 2, 4], 999), 3);
  assert.throws(() => g.lowestFreeNumber([1, 2, 3], 3));
});

test('4 последние цифры телефона', () => {
  assert.strictEqual(g.phoneLast4('+0 555 123-4567'), '4567');
});

test('43: разбор демо-времени', () => {
  const ref = new Date(2026, 10, 20, 9, 0);
  const d = g.parseDemoTime('20.11.2026 15:00', ref);
  assert.deepStrictEqual([d.getDate(), d.getMonth(), d.getHours(), d.getMinutes()], [20, 10, 15, 0]);
  const t = g.parseDemoTime(' 15:05 ', ref);
  assert.deepStrictEqual([t.getDate(), t.getHours(), t.getMinutes()], [20, 15, 5]);
  assert.strictEqual(g.parseDemoTime('31.02.2026 10:00', ref), null);
  assert.strictEqual(g.parseDemoTime('25:00', ref), null);
  assert.strictEqual(g.parseDemoTime('завтра', ref), null);
  assert.strictEqual(g.formatDateTime(d), '20.11.2026 15:00');
});

test('43: время идёт от вписанного, +3 минуты, пустая ячейка', () => {
  const demo = new Date(2026, 10, 20, 15, 0).getTime();
  const real = Date.now();
  const offset = demo - real;
  assert.strictEqual(g.computeNow(real + 90000, offset).getTime() - demo, 90000);
  assert.strictEqual(g.computeNow(real, offset + 180000).getTime() - demo, 180000);
  assert.strictEqual(g.computeNow(real, 0).getTime(), real);
});
