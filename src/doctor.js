/**
 * МОДУЛЬ ВРАЧА: окна «Начался ли приём?» и «Приём окончен?», напоминания, передача в регистратуру,
 * запланированное окончание, задержка, автоматическая неявка (тесты 1–7, 16, 23, 46).
 * Чистые функции: без таблицы, проверяются на компьютере. Время окон не хранится, а считается
 * из отметок (приход, открытие и закрытие карты, начало, окончание) и текущего времени.
 *
 * appt (для одного врача): { key, at, duration, status, arrivedAt, startedAt, endedAt,
 *                            cardOpenedAt, cardClosedAt, lateRef, shownLower, shownUpper }
 */

/**
 * Когда показать «Начался ли приём?» (тест 2, 3, 7):
 *  - пришёл за 2+ минуты до назначенного → в назначенное время; иначе → приход + 2 минуты;
 *  - открыл карту раньше → сразу при открытии карты;
 *  - пока предыдущий приём не закрыт — окна нет; после закрытия — не раньше чем через 1 минуту.
 * lastEnd — окончание последнего закрытого приёма этого врача (или null).
 */
function startDue_(a, lastEnd) {
  if (!isDate_(a.arrivedAt)) return null;                       // врач видит только пришедших (тест 1)
  var early = addMin_(a.at, -CONFIG.WINDOW_EARLY_ARRIVAL_MIN);
  var due = a.arrivedAt <= early ? a.at : addMin_(a.arrivedAt, CONFIG.WINDOW_AFTER_ARRIVAL_MIN);
  if (isDate_(a.cardOpenedAt) && a.cardOpenedAt < due) due = a.cardOpenedAt;
  if (isDate_(lastEnd) && due <= lastEnd) due = addMin_(lastEnd, CONFIG.WINDOW_AFTER_PREV_END_MIN);
  return due;
}

/** Окно показано в due: до него ничего, потом вопрос, через 5 минут напоминание, ещё через 5 — регистратура. */
function windowStage_(due, n) {
  if (!isDate_(due) || n < due) return 'wait';
  if (n < addMin_(due, CONFIG.REMIND_AFTER_MIN)) return 'ask';
  if (n < addMin_(due, CONFIG.REMIND_AFTER_MIN + CONFIG.TO_REGISTRY_AFTER_MIN)) return 'remind';
  return 'registry';
}

/**
 * Запланированное окончание (тест 6):
 *  6.1 пришёл вовремя → фактическое начало + длительность (решение А7);
 *  6.2 опоздал, задержки нет → назначенное + 5 + длительность;
 *  6.3 опоздал, задержка есть → верхняя граница интервала + 5 + длительность.
 */
function plannedEnd_(a, delayOn) {
  var dur = a.duration || CONFIG.DEFAULT_DURATION_MIN;
  if (isLateArrival_(a)) {
    var base = delayOn ? lateRef_(a) : a.at;
    return addMin_(base, CONFIG.LATE_GRACE_MIN + dur);
  }
  var start = isDate_(a.startedAt) ? a.startedAt : a.at;
  return addMin_(start, dur);
}

/** Для задержки: окончание по расписанию — назначенное + длительность; у опоздавшего — как в тесте 6.2/6.3. */
function scheduleEnd_(a, delayOn) {
  if (isLateArrival_(a)) return plannedEnd_(a, delayOn);
  return addMin_(a.at, a.duration || CONFIG.DEFAULT_DURATION_MIN);
}

/** Когда показать «Приём окончен?» (тест 5): при закрытии карты или в запланированное окончание. */
function endDue_(a, delayOn) {
  var planned = plannedEnd_(a, delayOn);
  return isDate_(a.cardClosedAt) && a.cardClosedAt < planned ? a.cardClosedAt : planned;
}

/**
 * Задержка у врача (тест 16): 3 приёма подряд закончились на 20+ минут позже окончания по расписанию.
 * Снимается, когда у ближайшего ожидающего пациента снова точное время (сдвиг не больше 5 минут, решение Б11).
 */
function doctorDelay_(appts) {
  var list = appts.slice().sort(function (x, y) { return x.at - y.at; });
  var streak = 0, on = false;
  list.forEach(function (a) {
    if (a.status !== STATUS.DONE || !isDate_(a.endedAt)) return;
    var lateBy = (a.endedAt - scheduleEnd_(a, on)) / 60000;
    streak = lateBy >= CONFIG.DELAY_LATE_MIN ? streak + 1 : 0;
    on = streak >= CONFIG.DELAY_STREAK;
  });
  if (on) {
    var next = list.filter(function (a) { return isPending_(a) && !isDate_(a.startedAt); })[0];
    var exact = next && !(isDate_(next.shownUpper) && isDate_(next.shownLower) && next.shownUpper > next.shownLower);
    if (exact) on = false;
  }
  return on;
}

/**
 * Окно врача сейчас (одно): { key, type: 'start'|'end', due, stage: 'ask'|'remind'|'registry' } или null.
 * Пока идёт приём — только «Приём окончен?» по нему; иначе «Начался ли приём?» для пришедшего с самым ранним окном.
 */
function doctorWindow_(appts, n) {
  var delayOn = doctorDelay_(appts);
  var going = appts.filter(function (a) { return a.status === STATUS.IN_PROGRESS && !isDate_(a.endedAt); })
    .sort(function (x, y) { return x.at - y.at; })[0];
  if (going) {
    var endDue = endDue_(going, delayOn);
    var s = windowStage_(endDue, n);
    return s === 'wait' ? null : { key: going.key, type: 'end', due: endDue, stage: s };
  }
  var lastEnd = null;
  appts.forEach(function (a) {
    if (isDate_(a.endedAt) && (!lastEnd || a.endedAt > lastEnd)) lastEnd = a.endedAt;
  });
  var best = null;
  appts.forEach(function (a) {
    if (a.status !== STATUS.ARRIVED || isDate_(a.startedAt)) return;
    var due = startDue_(a, lastEnd);
    if (!due || n < due) return;
    if (!best || due < best.due || (+due === +best.due && a.at < best.at)) best = { key: a.key, due: due, at: a.at };
  });
  return best ? { key: best.key, type: 'start', due: best.due, stage: windowStage_(best.due, n) } : null;
}

/**
 * Автоматическая неявка (тест 23, решение А2): начался приём started не раньше своего назначенного времени →
 * все более ранние приёмы этого врача, где пациент не отмечен пришедшим, — «неявка». Возвращает их ключи.
 */
function autoNoShows_(appts, started) {
  if (!isDate_(started.startedAt) || started.startedAt < started.at) return [];
  return appts.filter(function (a) {
    return a.key !== started.key && a.at < started.at && !isDate_(a.arrivedAt) &&
      (a.status === STATUS.WAITING || a.status === STATUS.RESCHEDULED);
  }).map(function (a) { return a.key; });
}
