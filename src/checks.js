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
  ];
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
