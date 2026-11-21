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
  ].concat(forecastChecks_(), screenChecks_(appts), lateChecks_(appts), doctorChecks_());
}

/** Этап 4: экраны отделений на живых данных таблицы (тесты 12, 13). */
function screenChecks_(rows) {
  var n = now_();
  var appts = rows.map(apptFromRow_);
  var doctors = readRows_(SHEETS.DOCTORS);
  var horizon = addMin_(n, CONFIG.SCREEN_HORIZON_MIN);
  var shown = 0, far = 0, mismatch = 0, farToday = 0;
  departments_().forEach(function (dep) {
    var cabinets = {};
    doctors.forEach(function (d) { if (d[1] === dep) cabinets[d[0]] = String(d[2]); });
    var items = screenItems_(appts, cabinets, n);
    shown += items.length;
    items.forEach(function (it) {
      var a = appts.filter(function (x) { return x.number === it.number && x.doctor in cabinets; })[0];
      if (!a) { mismatch++; return; }
      var shownFrom = it.kind === 'delayed' ? a.shownLower : a.at;
      if (it.kind !== 'in_progress' && shownFrom >= horizon) far++;
      var pageTime = buildPatientView_(a, n);
      var same = it.kind === 'in_progress' ? pageTime.kind === 'in_progress' : pageTime.timeText === it.timeText;
      if (!same) mismatch++;
    });
  });
  appts.forEach(function (a) {
    if (!isDate_(a.at) || daysBetween_(n, a.at) !== 0) return;
    var v = buildPatientView_(a, n);
    var from = v.kind === 'delayed' ? a.shownLower : a.at;
    if ((v.kind === 'today' || v.kind === 'delayed') && from >= horizon) farToday++;
  });
  var working = isWorkingTime_(n);
  return [
    result_(12, 'Экран: только ближайшие ' + (CONFIG.SCREEN_HORIZON_MIN / 60) + ' ч', !working ? 'частично' : far === 0,
      (working ? 'На экранах сейчас приёмов: ' + shown + ', дальше горизонта: ' + far +
        '. Сегодняшних приёмов с показанным временем дальше горизонта (на экран не попали): ' + farToday + '.'
        : 'Клиника закрыта по текущему времени — экраны выключены. Впиши демо-время в часы работы.')),
    result_(13, 'Экран и страница показывают одно время', !working ? 'частично' : mismatch === 0 && shown > 0,
      working ? 'Сравнено приёмов: ' + shown + ', расхождений: ' + mismatch + '. Время для экрана и страницы считает одна функция из одной публикации.'
        : 'Клиника закрыта — сравнивать нечего.'),
  ];
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

/** Этап 5: опоздание (примеры) и закрытые статусы в конце дня (живые данные). */
function lateChecks_(rows) {
  var T = function (h, m) { return new Date(2026, 10, 21, h, m); };
  var A = function (x) {
    var a = { number: 1, doctor: 'Врач', department: 'Отд.', at: T(12, 0), status: STATUS.WAITING, startedAt: '',
      shownLower: '', shownUpper: '', arrivedAt: '', lateRef: '' };
    Object.keys(x || {}).forEach(function (k) { a[k] = x[k]; });
    return a;
  };
  var out = [];
  var ok19 = !isLateArrival_(A({ status: STATUS.ARRIVED, arrivedAt: T(12, 5) })) &&
    !isLateArrival_(A({ status: STATUS.ARRIVED, arrivedAt: T(12, 24), shownLower: T(12, 10), shownUpper: T(12, 20) }));
  out.push(result_(19, 'Пришёл до границы «вовремя» — опоздания нет', ok19,
    'Приём 12.00, пришёл в 12.05; интервал 12.10–12.20, пришёл в 12.24 — оба вовремя.'));
  var v1 = buildPatientView_(A({ status: STATUS.ARRIVED, arrivedAt: T(12, 6) }), T(12, 7));
  var v2 = buildPatientView_(A(), T(12, 6));
  out.push(result_(20, 'Пришёл позже — сообщение о возможном сокращении', v1.kind === 'late' && v2.kind === 'late' &&
    v1.message.indexOf('Прием может быть сокращен') >= 0,
    'Пришёл в 12.06 на 12.00 и не пришёл к 12.06 — оба видят текст об опоздании.'));
  var ok46 = !isLate20_(A(), T(12, 19)) && isLate20_(A(), T(12, 20)) &&
    isLate20_(A({ shownLower: T(12, 10), shownUpper: T(12, 20) }), T(12, 40)) &&
    windowStage_(T(12, 0), T(12, 9)) === 'remind' && windowStage_(T(12, 0), T(12, 10)) === 'registry';
  out.push(result_(46, 'Регистратура: подсветка опоздания 20+ и «врач не ответил»', ok46,
    'Опоздание: с 12.20 для приёма в 12.00, с 12.40 для интервала 12.10–12.20. Вопрос врачу в 12.00 без ответа → ' +
    'напоминание в 12.05, регистратура в 12.10. Подсветку на странице регистратуры смотришь ты.'));

  var n = now_();
  var openToday = rows.map(apptFromRow_).filter(function (a) {
    return isDate_(a.at) && daysBetween_(n, a.at) === 0 && (isPending_(a) || a.status === STATUS.IN_PROGRESS);
  }).length;
  var closedNow = n.getHours() * 60 + n.getMinutes() >= minutesOf_(closeTime_());
  out.push(result_(26, 'К концу дня все приёмы закрыты', closedNow ? openToday === 0 : 'частично',
    closedNow ? 'Рабочий день закончился. Незакрытых приёмов сегодня: ' + openToday + '.'
      : 'Рабочий день ещё идёт. Незакрытых приёмов сейчас: ' + openToday + '. Проверь после ' + closeTime_() + '.'));
  return out;
}

/** Этап 6: окна врача, запланированное окончание, задержка, автоматическая неявка (примеры). */
function doctorChecks_() {
  var T = function (h, m) { return new Date(2026, 10, 21, h, m); };
  var hm = function (d) { return d ? d.getHours() + '.' + pad2_(d.getMinutes()) : '—'; };
  var A = function (key, h, m, x) {
    var a = { key: key, at: T(h, m), duration: 25, status: STATUS.WAITING, arrivedAt: '', startedAt: '', endedAt: '',
      cardOpenedAt: '', cardClosedAt: '', lateRef: '', shownLower: '', shownUpper: '', doctor: 'Врач' };
    Object.keys(x || {}).forEach(function (k) { a[k] = x[k]; });
    return a;
  };
  var arrived = function (h, m, x) {
    var o = { status: STATUS.ARRIVED, arrivedAt: T(h, m) };
    Object.keys(x || {}).forEach(function (k) { o[k] = x[k]; });
    return o;
  };
  var going = A('p', 11, 30, { status: STATUS.IN_PROGRESS, arrivedAt: T(11, 25), startedAt: T(11, 35) });
  var done = A('p', 11, 30, { status: STATUS.DONE, arrivedAt: T(11, 25), startedAt: T(11, 35), endedAt: T(12, 10) });
  var next = A('a', 12, 0, arrived(11, 50));
  var lateEnd = function (key, h) {
    return A(key, h, 0, { status: STATUS.DONE, arrivedAt: T(h - 1, 55), startedAt: T(h, 20), endedAt: T(h, 45) });
  };
  var cases = [
    [1, 'Окно только для пришедших', function () {
      return String(doctorWindow_([A('a', 12, 0)], T(12, 30))) + ' / ' + doctorWindow_([next], T(12, 0)).type; }, 'null / start'],
    [2, 'Окно: в назначенное время / приход + 2 / при открытии карты', function () {
      return [startDue_(A('a', 12, 0, arrived(11, 58)), null), startDue_(A('a', 12, 0, arrived(11, 59)), null),
        startDue_(A('a', 12, 0, arrived(11, 50, { cardOpenedAt: T(11, 53) })), null)].map(hm).join(' / '); }, '12.00 / 12.01 / 11.53'],
    [3, 'Пока предыдущий не закрыт — только «Приём окончен?»; потом через 1 минуту', function () {
      return doctorWindow_([going, next], T(12, 2)).type + ' / ' + hm(doctorWindow_([done, next], T(12, 11)).due); }, 'end / 12.11'],
    [4, 'Нет ответа: напоминание через 5 минут, регистратура ещё через 5', function () {
      return [T(12, 0), T(12, 5), T(12, 10)].map(function (n) { return windowStage_(T(12, 0), n); }).join(' / '); },
      'ask / remind / registry'],
    [5, '«Приём окончен?» — в запланированное окончание или при закрытии карты', function () {
      var g2 = A('p', 12, 0, { status: STATUS.IN_PROGRESS, arrivedAt: T(11, 55), startedAt: T(12, 0) });
      var g3 = A('p', 12, 0, { status: STATUS.IN_PROGRESS, arrivedAt: T(11, 55), startedAt: T(12, 0), cardClosedAt: T(12, 18) });
      return hm(doctorWindow_([g2], T(12, 25)).due) + ' / ' + hm(doctorWindow_([g3], T(12, 18)).due); }, '12.25 / 12.18'],
    [6, 'Запланированное окончание: вовремя / опоздал / опоздал при задержке', function () {
      return [plannedEnd_(A('a', 12, 0, { arrivedAt: T(11, 30), startedAt: T(11, 40) }), false),
        plannedEnd_(A('a', 12, 0, { arrivedAt: T(12, 10), startedAt: T(12, 12) }), false),
        plannedEnd_(A('a', 12, 0, { arrivedAt: T(12, 30), startedAt: T(12, 31), lateRef: T(12, 20) }), true)].map(hm).join(' / '); },
      '12.05 / 12.30 / 12.50'],
    [7, 'Пришёл раньше: окно при открытии карты, прогноз следующего не меняется', function () {
      var e = A('a', 14, 0, arrived(13, 30, { cardOpenedAt: T(13, 31) }));
      var s = A('a', 14, 0, { status: STATUS.IN_PROGRESS, arrivedAt: T(13, 30), startedAt: T(13, 31) });
      return hm(doctorWindow_([e], T(13, 31)).due) + ' / ' + hm(forecastDoctorDay_([s, A('n', 14, 30)], null, T(13, 35)).n.forecast); },
      '13.31 / 14.30'],
    [16, 'Задержка: 3 приёма подряд на 20+ минут позже расписания', function () {
      var nextI = A('d', 12, 0, { shownLower: T(12, 20), shownUpper: T(12, 30) });
      return [doctorDelay_([lateEnd('a', 9), lateEnd('b', 10), nextI]), doctorDelay_([lateEnd('a', 9), lateEnd('b', 10), lateEnd('c', 11), nextI]),
        doctorDelay_([lateEnd('a', 9), lateEnd('b', 10), lateEnd('c', 11), A('d', 12, 0)])].join(' / '); }, 'false / true / false'],
    [23, 'Автоматическая неявка: только если следующий начат не раньше своего времени', function () {
      var s = A('z', 13, 0, { status: STATUS.IN_PROGRESS, arrivedAt: T(12, 50), startedAt: T(13, 0) });
      var e = A('z', 13, 0, { status: STATUS.IN_PROGRESS, arrivedAt: T(12, 50), startedAt: T(12, 55) });
      return autoNoShows_([A('x', 12, 0), s], s).join(',') + ' / ' + (autoNoShows_([A('x', 12, 0), e], e).join(',') || 'нет'); },
      'x / нет'],
  ];
  return cases.map(function (k) {
    var got;
    try { got = k[2](); } catch (e) { got = 'ошибка: ' + e.message; }
    return result_(k[0], k[1], got === k[3], 'Ожидается: ' + k[3] + '. Получено: ' + got + '.');
  });
}

function result_(num, title, ok, details) {
  var status = ok === 'частично' ? 'частично' : (ok ? 'прошёл' : 'не прошёл');
  return { num: num, title: title, status: status, details: details };
}
