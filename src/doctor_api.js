/**
 * СЕРВЕР ДЛЯ СТРАНИЦЫ ВРАЧА И ОТВЕТОВ РЕГИСТРАТУРЫ ЗА ВРАЧА.
 * Страница врача вызывает getDoctorView и doctorAction с ключом служебных страниц.
 * Имя пациента берётся из «Записей» внутри Apps Script и видно только врачу (spec.md).
 */

/** Данные страницы врача: пришедшие пациенты и текущее окно. */
function getDoctorView(key, doctor) {
  if (!isStaffKey_(key)) throw new Error('Нет доступа');
  return doctorState_(String(doctor), now_());
}

/**
 * Действие врача: 'openCard' | 'closeCard' | 'startYes' | 'endYes'.
 * «Нет» в окне сервер не меняет: окно вернётся напоминанием через 5 минут (тест 4).
 */
function doctorAction(key, doctor, token, action) {
  if (!isStaffKey_(key)) throw new Error('Нет доступа');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var n = now_();
    var ctx = doctorContext_(String(doctor), n);
    var a = ctx.byKey[token];
    if (!a) throw new Error('Пациент не найден у этого врача');
    if (action === 'openCard') {
      if (!isDate_(a.cardOpenedAt)) ctx.set(token, 'Карта открыта', n);
    } else if (action === 'closeCard') {
      ctx.set(token, 'Карта закрыта', n);
    } else if (action === 'startYes') {
      startAppointment_(ctx, a, n);
    } else if (action === 'endYes') {
      endAppointment_(ctx, a, n);
    } else {
      throw new Error('Неизвестное действие');
    }
    return doctorState_(String(doctor), n);
  } finally {
    lock.releaseLock();
  }
}

/** Приём начался в момент at: время начала, статус «идёт», автоматическая неявка (тест 23), пересчёт. */
function startAppointment_(ctx, a, at) {
  ctx.set(a.key, 'Начало', at);
  ctx.set(a.key, 'Статус', STATUS.IN_PROGRESS);
  a.startedAt = at;
  a.status = STATUS.IN_PROGRESS;
  autoNoShows_(ctx.appts, a).forEach(function (k) { ctx.set(k, 'Статус', STATUS.NO_SHOW); });
  recalc_(at);
}

/** Приём окончен в момент at: время окончания, статус «состоялся», пересчёт. */
function endAppointment_(ctx, a, at) {
  ctx.set(a.key, 'Окончание', at);
  ctx.set(a.key, 'Статус', STATUS.DONE);
  recalc_(at);
}

/** Приёмы врача за сегодня (ключ — токен) и запись в таблицу по токену. */
function doctorContext_(doctor, n) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.APPOINTMENTS);
  var rows = readRows_(SHEETS.APPOINTMENTS);
  var c = apptCol_;
  var rowOf = {}, appts = [], byKey = {};
  rows.forEach(function (r, i) {
    var token = r[c('Токен')];
    rowOf[token] = i + 2;
    if (r[c('Врач')] !== doctor || !isDate_(r[c('Дата и время приёма')])) return;
    if (daysBetween_(n, r[c('Дата и время приёма')]) !== 0) return;
    var a = apptFromRow_(r);
    a.key = token;
    appts.push(a);
    byKey[token] = a;
  });
  return {
    appts: appts,
    byKey: byKey,
    set: function (token, col, value) { sheet.getRange(rowOf[token], c(col) + 1).setValue(value); },
  };
}

/** Что видит врач: только пришедшие пациенты (тест 1), имя и время; окно — одно. */
function doctorState_(doctor, n) {
  var ctx = doctorContext_(doctor, n);
  var names = {};
  readRows_(SHEETS.BOOKINGS).forEach(function (b) { names[b[0]] = b[2]; });
  var win = doctorWindow_(ctx.appts, n);
  var patients = ctx.appts.filter(function (a) {
    return isDate_(a.arrivedAt) && (a.status === STATUS.ARRIVED || a.status === STATUS.IN_PROGRESS);
  }).sort(function (x, y) { return x.at - y.at; }).map(function (a) {
    return {
      token: a.key, name: names[a.key] || '—', time: formatTime_(a.at), status: a.status,
      cardOpen: isDate_(a.cardOpenedAt), cardClosed: isDate_(a.cardClosedAt),
    };
  });
  return {
    now: formatDateTime_(n),
    doctor: doctor,
    delay: doctorDelay_(ctx.appts),
    patients: patients,
    window: win ? {
      token: win.key, type: win.type, stage: win.stage, due: formatTime_(win.due),
      name: names[win.key] || '—', time: formatTime_(ctx.byKey[win.key].at),
    } : null,
  };
}

/** Вопросы врача, которые ушли в регистратуру (тест 46): { токен: { type, due } } по всем врачам. */
function registryQuestions_(n) {
  var byDoctor = {};
  readRows_(SHEETS.APPOINTMENTS).forEach(function (r) {
    var at = r[apptCol_('Дата и время приёма')];
    if (!isDate_(at) || daysBetween_(n, at) !== 0) return;
    var a = apptFromRow_(r);
    a.key = r[apptCol_('Токен')];
    (byDoctor[a.doctor] = byDoctor[a.doctor] || []).push(a);
  });
  var out = {};
  Object.keys(byDoctor).forEach(function (doc) {
    var w = doctorWindow_(byDoctor[doc], n);
    if (w && w.stage === 'registry') out[w.key] = { type: w.type, due: w.due, doctor: doc };
  });
  return out;
}

/** Время для ответа регистратуры: шаг 5 минут, от окна − 30 минут до «сейчас» (решение Б20). */
function answerTimeOptions_(due, n) {
  var step = 5 * 60000;
  var from = Math.floor((due.getTime() - 30 * 60000) / step) * step;
  var to = Math.floor(n.getTime() / step) * step;
  var out = [];
  for (var t = from; t <= to; t += step) out.push(formatTime_(new Date(t)));
  return out;
}
