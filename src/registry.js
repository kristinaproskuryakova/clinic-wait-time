/**
 * РЕГИСТРАТУРА (служебная страница; requirements.md, «Отметки персонала», «Опоздание и неявка»).
 * Приёмы дня по времени: номер, врач, отделение, 4 цифры телефона, статус, показанное время.
 * Кнопки: пришёл, перенёс, отменил, не пришёл; ручная смена статуса (тесты 24, 25).
 * Подсветка: опоздание на 20+ минут (тест 46). «Врач не ответил» — на этапе 6.
 * Страница вызывает эти функции с ключом служебных страниц — без него они ничего не делают.
 */

/** Данные для страницы регистратуры. */
function getRegistryView(key) {
  if (!isStaffKey_(key)) throw new Error('Нет доступа');
  return registryState_(now_());
}

/**
 * Действие регистратуры над приёмом (по токену).
 * action: 'arrived' | 'cancel' | 'noshow' | 'reschedule' (payload: «25.11.2026 10:00») | 'status' (payload: статус)
 */
function registryAction(key, token, action, payload) {
  if (!isStaffKey_(key)) throw new Error('Нет доступа');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var n = now_();
    var sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.APPOINTMENTS);
    var rows = readRows_(SHEETS.APPOINTMENTS);
    var c = apptCol_;
    var i = rows.map(function (r) { return r[c('Токен')]; }).indexOf(token);
    if (i < 0) throw new Error('Приём не найден');
    var row = i + 2;
    var appt = apptFromRow_(rows[i]);
    var set = function (col, value) { sheet.getRange(row, c(col) + 1).setValue(value); };

    if (action === 'arrived') {
      set('Пришёл', n);
      if (!isDate_(appt.lateRef)) set('Опоздание от', lateRef_(appt)); // опорное время — на момент прихода
      if (isPending_(appt)) set('Статус', STATUS.ARRIVED);
    } else if (action === 'cancel') {
      set('Статус', STATUS.CANCELLED);                  // отмену ставит только регистратура
    } else if (action === 'noshow') {
      set('Статус', STATUS.NO_SHOW);
    } else if (action === 'reschedule') {
      var d = parseDemoTime_(String(payload || ''), n);
      var problem = rescheduleProblem_(d, n);
      if (problem) throw new Error(problem);
      rescheduleAppointment_(token, d);
      sendConfirmation_(token, n);   // новое подтверждение; напоминания пойдут по новой дате
    } else if (action === 'answerStart' || action === 'answerEnd') {
      // Ответ регистратуры за врача (решения Б7, Б20): «вовремя» = время показа окна врачу, иначе время с шагом 5 минут.
      var ctx = doctorContext_(appt.doctor, n);
      var a = ctx.byKey[token];
      var w = doctorWindow_(ctx.appts, n);
      var type = action === 'answerStart' ? 'start' : 'end';
      if (!w || w.key !== token || w.type !== type) throw new Error('У врача сейчас нет такого вопроса по этому пациенту');
      var at = payload === 'on_time' ? w.due : parseDemoTime_(String(payload), n);
      if (!isDate_(at) || at > n) throw new Error('Неверное время');
      if (type === 'start') startAppointment_(ctx, a, at); else endAppointment_(ctx, a, at);
    } else if (action === 'status') {
      var st = normalizeStatus_(payload);
      if (!st) throw new Error('Нет такого статуса: ' + payload);
      set('Статус', st);
    } else {
      throw new Error('Неизвестное действие');
    }
    recalc_(n); // прогноз для остальных пересчитан сразу, пациенты увидят его на ближайшей публикации
    return registryState_(n);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Перенос (решение А4): новая дата и время в той же записи — и в «Записях» (система записи), и в «Приёмах».
 * Токен и номер те же, отметки прихода, начала и окончания и прогноз очищаются.
 * Новое SMS-подтверждение — на этапе 7.
 */
function rescheduleAppointment_(token, newAt) {
  var ss = SpreadsheetApp.getActive();
  var c = apptCol_;
  var appts = ss.getSheetByName(SHEETS.APPOINTMENTS);
  var rows = readRows_(SHEETS.APPOINTMENTS);
  var i = rows.map(function (r) { return r[c('Токен')]; }).indexOf(token);
  var row = i + 2;
  appts.getRange(row, c('Дата и время приёма') + 1).setValue(newAt);
  ['Пришёл', 'Начало', 'Окончание', 'Прогноз', 'Сообщение', 'Ниж. (расчёт)', 'Верх. (расчёт)',
    'Ниж. (показ)', 'Верх. (показ)', 'Опоздание от'].forEach(function (col) {
    appts.getRange(row, c(col) + 1).setValue('');
  });
  appts.getRange(row, c('Статус') + 1).setValue(STATUS.RESCHEDULED);

  var bookings = ss.getSheetByName(SHEETS.BOOKINGS);
  var tokens = readRows_(SHEETS.BOOKINGS).map(function (r) { return r[0]; });
  var b = tokens.indexOf(token);
  if (b >= 0) bookings.getRange(b + 2, COLUMNS[SHEETS.BOOKINGS].indexOf('Дата и время приёма') + 1).setValue(newAt);
}

/** Приёмы дня для регистратуры, по времени. */
function registryState_(n) {
  var c = apptCol_;
  var items = [];
  var questions = registryQuestions_(n);   // вопросы врача без ответа 10 минут (тест 46)
  readRows_(SHEETS.APPOINTMENTS).forEach(function (r) {
    var a = apptFromRow_(r);
    if (!isDate_(a.at) || daysBetween_(n, a.at) !== 0) return;
    var view = buildPatientView_(a, n);
    items.push({
      token: r[c('Токен')],
      at: a.at.getTime(),
      number: a.number,
      time: formatTime_(a.at),
      shown: (view.kind === 'today' || view.kind === 'delayed' || view.kind === 'late') ? view.timeText : '',
      doctor: a.doctor,
      department: a.department,
      last4: String(r[c('Телефон (4 цифры)')]),
      status: a.status || String(r[c('Статус')]),
      arrived: isDate_(a.arrivedAt) ? formatTime_(a.arrivedAt) : '',
      late: isLateArrival_(a) || isAbsentLate_(a, n),
      late20: isLate20_(a, n),
      pending: isPending_(a),
      question: questions[r[c('Токен')]] ? {
        type: questions[r[c('Токен')]].type,
        due: formatTime_(questions[r[c('Токен')]].due),
        options: answerTimeOptions_(questions[r[c('Токен')]].due, n),
      } : null,
    });
  });
  items.sort(function (x, y) { return x.at - y.at || x.number - y.number; });
  return {
    now: formatDateTime_(n),
    today: n.getFullYear() + '-' + pad2_(n.getMonth() + 1) + '-' + pad2_(n.getDate()), // для календаря
    slots: bookingSlots_(),
    statuses: Object.keys(STATUS).map(function (k) { return STATUS[k]; }),
    items: items,
  };
}

/** Окна записи на день: «08:00», «08:30», … последнее начинается не позже закрытия минус шаг сетки. */
function bookingSlots_() {
  var out = [];
  for (var m = minutesOf_(openTime_()); m + CONFIG.SLOT_MIN <= minutesOf_(closeTime_()); m += CONFIG.SLOT_MIN) {
    out.push(pad2_(Math.floor(m / 60)) + ':' + pad2_(m % 60));
  }
  return out;
}

/** Почему на это время перенести нельзя (или '' — можно). */
function rescheduleProblem_(d, n) {
  if (!isDate_(d)) return 'Выбери дату и время.';
  if (d < n) return 'Это время уже прошло.';
  if (CONFIG.WORK_DAYS.indexOf(d.getDay()) < 0) return 'В этот день клиника не работает (воскресенье).';
  var m = d.getHours() * 60 + d.getMinutes();
  if (m < minutesOf_(openTime_()) || m + CONFIG.SLOT_MIN > minutesOf_(closeTime_())) {
    return 'Время вне часов работы клиники (' + openTime_() + '–' + closeTime_() + ').';
  }
  return '';
}
