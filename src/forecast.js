/**
 * МОДУЛЬ ПРОГНОЗА: чистый расчёт без таблицы, чтобы его можно было проверить на примерах из tests.md.
 * Правила — requirements.md, раздел «Прогноз». Все числа — в CONFIG (config.js).
 *
 * forecastDoctorDay_(appts, lunchStartMin, now) считает приёмы ОДНОГО врача за сегодня.
 *   appts: [{ key, at: Date, duration: мин, status, startedAt: Date|'', endedAt: Date|'' }]
 *   lunchStartMin: начало обеда врача в минутах от полуночи (11:30 → 690), или null
 * Возвращает { key: { forecast: Date, lower: Date, upper: Date } } только для ещё не начавшихся приёмов.
 * Если lower = upper = назначенное время — показываем точное время, иначе интервал «lower–upper».
 */
function forecastDoctorDay_(appts, lunchStartMin, now) {
  var MIN = 60000;
  now = new Date(Math.floor(now.getTime() / MIN) * MIN); // считаем по целым минутам
  var list = appts.filter(function (a) {
    // Отменённые, неявки и не пришедшие к границе «вовремя» место в цепочке не занимают.
    return a.status !== STATUS.CANCELLED && a.status !== STATUS.NO_SHOW && !a.skip;
  }).sort(function (a, b) { return a.at - b.at; });

  var result = {};
  var free = null;   // когда врач освободится: фактическое окончание или прогноз окончания предыдущего
  var prev = null;   // предыдущий приём: { plannedEnd, done, going }
  var lunchAt = null;
  if (lunchStartMin !== null && lunchStartMin !== undefined && list.length) {
    var d0 = list[0].at;
    lunchAt = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), 0, lunchStartMin);
  }

  list.forEach(function (a) {
    var dur = a.duration || CONFIG.DEFAULT_DURATION_MIN;
    // Обед: от окончания последнего приёма до обеда + 60 + 5 минут (тест 41).
    if (lunchAt && prev && prev.at < lunchAt && a.at >= lunchAt && free) {
      free = addMin_(free, CONFIG.LUNCH_MIN + CONFIG.LUNCH_BUFFER_MIN);
    }

    if (a.status === STATUS.DONE) {
      var s = isDate_(a.startedAt) ? a.startedAt : a.at;
      free = isDate_(a.endedAt) ? a.endedAt : addMin_(s, dur);   // считаем от фактического окончания
      prev = { at: a.at, plannedEnd: addMin_(a.at, dur), done: true, going: false };
      return;
    }
    if (a.status === STATUS.IN_PROGRESS) {
      free = now;                                                  // остаток идущего приёма = 0 (тест 38)
      prev = { at: a.at, plannedEnd: addMin_(a.at, dur), done: false, going: true };
      return;
    }

    // Ещё не начался: позднее из «назначенное» и «врач освободится» (тест 37).
    // «Сейчас» добавляем только для пришедшего: его примут не раньше, чем сейчас. Не пришедшего «сейчас»
    // не двигает — иначе его время ехало бы вслед за часами и он никогда не считался бы опоздавшим.
    var candidates = [a.at, free || a.at];
    if (isDate_(a.arrivedAt)) candidates.push(now);
    var f = maxDate_(candidates);
    var shown = interval_(a.at, f, now, prev);
    result[a.key] = { forecast: f, lower: shown.lower, upper: shown.upper };

    // Приём длится плановую длительность от прогноза начала (тест 37).
    // Если его время уже наступило, а отметки «начался» нет — для правил сдвига интервала
    // следующего пациента он считается идущим (решение Б7), но длительность у него полная.
    var going = f.getTime() <= now.getTime();
    free = addMin_(f, dur);
    prev = { at: a.at, plannedEnd: addMin_(a.at, dur), done: false, going: going };
  });
  return result;
}

/** Что показать для приёма: точное время или интервал (тесты 8–11, 39, 40). */
function interval_(at, forecast, now, prev) {
  var shift = (forecast - at) / 60000;                        // сдвиг по прогнозу до округления (решение Б4)
  var width = intervalWidth_((at - now) / 60000);             // по времени до назначенного приёма (Б3)
  var lower = at, upper = at;                                 // точное время

  if (shift > CONFIG.SHIFT_THRESHOLD_MIN) {
    upper = ceilTo_(forecast, CONFIG.ROUND_TO_MIN);           // прогноз — верхняя граница, округление вверх
    lower = maxDate_([at, addMin_(upper, -width)]);           // не раньше назначенного
  } else if (prev && !prev.done && now >= prev.plannedEnd) {
    // Предыдущий не закончился к своему запланированному окончанию → интервал от назначенного (Б6).
    upper = addMin_(at, width);
  }

  if (upper > lower && prev && prev.going) {
    // За 6 минут до верхней границы, если предыдущий ещё идёт, — сдвиг на 5 минут, сразу до нужного места (Б8).
    while (now >= addMin_(upper, -CONFIG.SHIFT_AHEAD_MIN)) {
      lower = addMin_(lower, CONFIG.SHIFT_STEP_MIN);
      upper = addMin_(upper, CONFIG.SHIFT_STEP_MIN);
    }
  }
  return { lower: lower, upper: upper };
}

/** Ширина интервала по минутам до назначенного приёма (тест 9). */
function intervalWidth_(minutesToAppt) {
  if (minutesToAppt < CONFIG.WIDTH_NEAR_MAX_MIN) return CONFIG.WIDTH_NEAR_MIN;
  if (minutesToAppt <= CONFIG.WIDTH_MID_MAX_MIN) return CONFIG.WIDTH_MID_MIN;
  return CONFIG.WIDTH_FAR_MIN;
}

/** Округление вверх до кратного step минут: 14.37 → 14.40, 14.35 → 14.35 (тест 39). */
function ceilTo_(d, step) {
  var minutes = d.getHours() * 60 + d.getMinutes() + (d.getSeconds() || d.getMilliseconds() ? 1 : 0);
  var up = Math.ceil(minutes / step) * step;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, up);
}

/**
 * Ритм (тест 14): от открытия клиники пересчёт на 2-й минуте цикла, публикация на 3-й, цикл 3 минуты.
 * Возвращает номера циклов: пересчёт №k на минуте 3k+2, публикация №k на минуте 3k+3.
 * Номер -1 — шага ещё не было.
 */
function cycleStep_(now, openMin) {
  var m = Math.floor((now.getHours() * 60 + now.getMinutes()) - openMin);
  return {
    recalc: m >= CONFIG.RECALC_AT_MIN ? Math.floor((m - CONFIG.RECALC_AT_MIN) / CONFIG.CYCLE_MIN) : -1,
    publish: m >= CONFIG.CYCLE_MIN ? Math.floor(m / CONFIG.CYCLE_MIN) - 1 : -1,
  };
}

function addMin_(d, m) {
  return new Date(d.getTime() + m * 60000);
}

function maxDate_(list) {
  return new Date(Math.max.apply(null, list.map(function (d) { return d.getTime(); })));
}
