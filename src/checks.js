/**
 * СТРАНИЦА «ПРОВЕРКИ»: автоматические проверки тестов из tests.md по номерам.
 * Каждая проверка возвращает: номер теста, что проверяли, итог и пояснение.
 * Итог: 'прошёл', 'не прошёл' или 'частично' (часть теста проверяется на следующих этапах).
 */

function runChecks_() {
  var appts = readRows_(SHEETS.APPOINTMENTS);
  var bookings = readRows_(SHEETS.BOOKINGS);
  return [
    check28_(appts),
    check30_(bookings),
    check42_(appts),
    check43_(),
  ].concat(forecastChecks_());
}

/**
 * Этап 3: модуль прогноза на примерах из tests.md (те же примеры проверяются и на компьютере).
 * Каждый пример — свой маленький день врача 21.11.2026, независимо от данных в таблице.
 */
function forecastChecks_() {
  var T = function (h, m) { return new Date(2026, 10, 21, h, m); };
  var hm = function (d) { return d.getHours() + '.' + pad2_(d.getMinutes()); };
  var show = function (r) { return r.lower.getTime() === r.upper.getTime() ? hm(r.lower) : hm(r.lower) + '–' + hm(r.upper); };
  var A = function (key, h, m, status, s, e) {
    return { key: key, at: T(h, m), duration: 25, status: status || STATUS.WAITING, startedAt: s || '', endedAt: e || '' };
  };
  var going = function () { return A('p', 14, 0, STATUS.IN_PROGRESS, T(14, 0)); };
  var cases = [
    [8, 'Сдвиг до 5 минут — точное время', function () {
      return show(interval_(T(14, 0), T(14, 5), T(13, 30), null)); }, '14.00'],
    [9, 'Сдвиг больше 5 минут — интервал; ширина 10 / 15 / 30', function () {
      return show(interval_(T(14, 0), T(14, 6), T(13, 30), null)) + '; ' +
        [59, 60, 120, 121].map(intervalWidth_).join(' / '); }, '14.00–14.10; 10 / 15 / 15 / 30'],
    [10, 'Нижняя граница не раньше назначенного', function () {
      return show(interval_(T(14, 0), T(14, 20), T(11, 30), null)) + '; ' +
        show(interval_(T(14, 0), T(14, 40), T(11, 30), null)); }, '14.00–14.20; 14.10–14.40'],
    [11, 'Время раньше назначенного не показывается (500 случайных случаев)', function () {
      for (var i = 0; i < 500; i++) {
        var at = T(9 + Math.floor(Math.random() * 7), 0);
        var r = interval_(at, addMin_(at, Math.floor(Math.random() * 90)),
          addMin_(at, -Math.floor(Math.random() * 200 - 30)), { done: false, going: Math.random() < 0.5, plannedEnd: at });
        if (r.lower < at || r.upper < r.lower) return 'нарушено';
      }
      return 'ни разу'; }, 'ни разу'],
    [14, 'Пересчёт на 2-й минуте, публикация на 3-й, цикл 3 минуты (от 8.00)', function () {
      return [[8, 1], [8, 2], [8, 3], [8, 5], [8, 6]].map(function (t) {
        var s = cycleStep_(T(t[0], t[1]), 480);
        return t[0] + '.' + pad2_(t[1]) + ' ' + (s.recalc >= 0 ? 'п' + s.recalc : '–') + '/' + (s.publish >= 0 ? 'о' + s.publish : '–');
      }).join(', '); }, '8.01 –/–, 8.02 п0/–, 8.03 п0/о0, 8.05 п1/о0, 8.06 п1/о1'],
    [36, 'Врач освободился раньше — назначенное время', function () {
      return show(forecastDoctorDay_([A('p', 14, 0, STATUS.DONE, T(14, 0), T(14, 15)), A('a', 14, 30)], null, T(14, 16)).a); }, '14.30'],
    [37, 'Цепочка: предыдущий закончился в 14.45', function () {
      var r = forecastDoctorDay_([A('p', 14, 0, STATUS.DONE, T(14, 20), T(14, 45)), A('a', 14, 30), A('b', 15, 0), A('c', 15, 30)], null, T(14, 45));
      return ['a', 'b', 'c'].map(function (k) { return hm(r[k].forecast); }).join(', '); }, '14.45, 15.10, 15.35'],
    [38, 'Приём ещё идёт: сейчас 14.40 → прогноз для 14.30', function () {
      return hm(forecastDoctorDay_([going(), A('a', 14, 30)], null, T(14, 40)).a.forecast); }, '14.40'],
    [39, 'Округление вверх: прогноз 14.37', function () { return hm(ceilTo_(T(14, 37), 5)); }, '14.40'],
    [40, 'Сдвиг интервала в 14.34 и 14.39', function () {
      var at = function (h, m) { return show(forecastDoctorDay_([going(), A('a', 14, 30)], null, T(h, m)).a); };
      return at(14, 26) + ' → ' + at(14, 34) + ' → ' + at(14, 39); }, '14.30–14.40 → 14.35–14.45 → 14.40–14.50'],
    [41, 'Обед: последний до обеда закончился на 20 минут позже', function () {
      return hm(forecastDoctorDay_([A('p', 10, 30, STATUS.DONE, T(10, 50), T(11, 15)), A('a', 12, 0)], 660, T(11, 15)).a.forecast); },
      '12.20 (на 20 минут позже 12.00)'],
  ];
  return cases.map(function (k) {
    var got;
    try { got = k[2](); } catch (e) { got = 'ошибка: ' + e.message; }
    var expected = k[3].replace(/ \(.*\)$/, '');
    return result_(k[0], k[1], got === expected, 'Ожидается: ' + k[3] + '. Получено: ' + got + '.');
  });
}

/** 28. Токен — длинная случайная строка, около 20 символов. */
function check28_(appts) {
  var tokens = appts.map(function (r) { return r[apptCol_('Токен')]; });
  if (!tokens.length) return result_(28, 'Формат токенов', false, 'Приёмов нет — сначала «Создать демо-день».');
  var bad = tokens.filter(function (t) { return !isTokenFormat_(t); });
  return result_(28, 'Формат токенов', bad.length === 0,
    'Приёмов: ' + tokens.length + '. Длина ' + CONFIG.TOKEN_LENGTH + ', алфавит из 32 символов. ' +
    (bad.length ? 'Неправильных: ' + bad.length : 'Все правильные.') + ' Пример: ' + tokens[0]);
}

/** 30. Токены двух соседних записей не похожи. И все токены разные. */
function check30_(bookings) {
  var tokens = bookings.map(function (r) { return r[0]; }).filter(String);
  if (tokens.length < 2) return result_(30, 'Соседние токены не похожи', false, 'Мало записей.');
  var alike = 0;
  for (var i = 1; i < tokens.length; i++) {
    if (tokensLookAlike_(tokens[i - 1], tokens[i])) alike++;
  }
  var unique = {};
  tokens.forEach(function (t) { unique[t] = true; });
  var dup = tokens.length - Object.keys(unique).length;
  return result_(30, 'Соседние токены не похожи', alike === 0 && dup === 0,
    'Пар соседей: ' + (tokens.length - 1) + ', похожих: ' + alike + ', повторов: ' + dup +
    '. «Похожи» = общее начало из 3+ символов или 6+ совпадений на тех же местах. ' +
    'Оценку «на глаз» делаешь ты.');
}

/** 42. Номера незакрытых приёмов разные, не больше трёх цифр. */
function check42_(appts) {
  var open = appts.filter(function (r) { return isOpenStatus_(r[apptCol_('Статус')]); });
  if (!open.length) return result_(42, 'Номер в очереди', false, 'Незакрытых приёмов нет.');
  var seen = {}, dup = 0, bad = 0;
  open.forEach(function (r) {
    var n = r[apptCol_('Номер')];
    if (!(n === Math.floor(n) && n >= 1 && n <= CONFIG.QUEUE_NUMBER_MAX)) bad++;
    if (seen[n]) dup++;
    seen[n] = true;
  });
  var ok = dup === 0 && bad === 0;
  return result_(42, 'Номер в очереди', ok ? 'частично' : false,
    'Незакрытых приёмов: ' + open.length + ', повторов: ' + dup + ', вне 1–' + CONFIG.QUEUE_NUMBER_MAX + ': ' + bad +
    '. «Одинаковый в SMS, на странице, на экране и в регистратуре» — на этапах 2–7.');
}

/** 43. Демо-время: функция времени. Кнопка «+3 минуты» и все модули — на этапе 3. */
function check43_() {
  var errors = [];
  var ref = new Date(2026, 10, 20, 9, 0, 0);
  var d = parseDemoTime_('20.11.2026 15:00', ref);
  if (!d || d.getHours() !== 15 || d.getMinutes() !== 0 || d.getDate() !== 20) errors.push('не разобрано «20.11.2026 15:00»');
  var t = parseDemoTime_('15:00', ref);
  if (!t || t.getHours() !== 15 || t.getDate() !== 20) errors.push('не разобрано «15:00»');
  if (parseDemoTime_('завтра', ref) !== null) errors.push('принят непонятный текст');
  // Время идёт: вписали 15:00 в момент real → через 90 секунд должно быть 15:01:30.
  var real = Date.UTC(2026, 10, 20, 7, 12, 0);
  var offset = d.getTime() - real;
  var later = computeNow_(real + 90000, offset);
  if (later.getTime() - d.getTime() !== 90000) errors.push('время не идёт от вписанного');
  // +3 минуты: сдвиг на 180 секунд.
  if (computeNow_(real, offset + 3 * 60000).getTime() - d.getTime() !== 180000) errors.push('+3 минуты не работает');
  // Пустая ячейка: сдвиг 0 = настоящие часы.
  if (computeNow_(real, 0).getTime() !== real) errors.push('без демо-времени не настоящие часы');

  var mode = isDemoTime_() ? 'демо-время' : 'настоящие часы';
  return result_(43, 'Демо-время (функция времени)', errors.length ? false : 'частично',
    (errors.length ? 'Ошибки: ' + errors.join('; ') + '. ' : 'Разбор времени, ход часов и сдвиг +3 — верно. ') +
    'Сейчас: ' + formatDateTime_(now_()) + ' (' + mode + '). Кнопка «+3 минуты» и все модули — этап 3.');
}

function result_(num, title, ok, details) {
  var status = ok === 'частично' ? 'частично' : (ok ? 'прошёл' : 'не прошёл');
  return { num: num, title: title, status: status, details: details };
}
