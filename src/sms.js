/**
 * SMS-МОДУЛЬ: «отправка» = строка в листе «Журнал SMS» (настоящих SMS нет).
 * Телефон берётся из «Записей» внутри Apps Script, но в журнал не пишется (тест 44).
 * Все модули зовут SMS только через эти функции: «сообщение типа Х по приёму с токеном Y» (spec.md).
 * Строки пишутся в журнал пачкой — так быстрее, чем по одной.
 */

/** Шаг SMS (таймер раз в минуту и «+3 минуты»): напоминания, опоздания, задержки. Каждое — один раз. */
function smsStep_(n) {
  var ctx = smsContext_();
  return sendBatch_(ctx, dueSms_(ctx.appts, n).map(function (d) {
    return { type: d.type, token: d.token, sentAt: n };
  }));
}

/** Подтверждения записи (при записи и при переносе): [{ token, sentAt }]. Один раз на дату приёма. */
function sendConfirmations_(items) {
  var ctx = smsContext_();
  return sendBatch_(ctx, items.map(function (it) { return { type: SMS.CONFIRM, token: it.token, sentAt: it.sentAt }; }));
}

function sendConfirmation_(token, sentAt) {
  return sendConfirmations_([{ token: token, sentAt: sentAt }]);
}

/** Демо: напоминания, которые по времени уже должны были уйти, — с их настоящим временем отправки. */
function backfillReminders_(n) {
  var ctx = smsContext_();
  var items = [];
  ctx.appts.forEach(function (a) {
    if (!isPending_(a) || !isDate_(a.at) || a.at <= n) return;
    smsReminderPlan_(a.createdAt, a.at).forEach(function (r) {
      if (r.sendAt <= n) items.push({ type: r.type, token: a.token, sentAt: r.sendAt });
    });
  });
  return sendBatch_(ctx, items);
}

/** Пишет в журнал SMS, которых там ещё нет. Возвращает, сколько записано. */
function sendBatch_(ctx, items) {
  var rows = [];
  items.forEach(function (it) {
    var a = ctx.byToken[it.token];
    if (!a) return;
    var key = smsKey_(it.token, it.type, a.at);
    if (ctx.sent[key]) return;                          // одно SMS этого типа на приём (тест 18)
    if (!ctx.phones[it.token]) return;                  // как настоящий модуль: без телефона отправить некуда
    var view = buildPatientView_(a, it.sentAt);
    var msg = smsText_(it.type, a, patientLink_(it.token), view.timeText);
    rows.push([it.token, it.type, msg.subject, msg.text, it.sentAt, a.at]);   // телефона в журнале нет
    ctx.sent[key] = true;
  });
  if (rows.length) {
    var sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.SMS_LOG);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
  return rows.length;
}

/** Всё, что нужно SMS-модулю, одним чтением: приёмы, телефоны и время создания записей, уже отправленное. */
function smsContext_() {
  var phones = {}, created = {};
  readRows_(SHEETS.BOOKINGS).forEach(function (b) { phones[b[0]] = b[7]; created[b[0]] = b[5]; });
  var byToken = {};
  var appts = readRows_(SHEETS.APPOINTMENTS).map(function (r) {
    var a = apptFromRow_(r);
    a.token = r[apptCol_('Токен')];
    a.createdAt = created[a.token];
    byToken[a.token] = a;
    return a;
  });
  var sent = {};
  readRows_(SHEETS.SMS_LOG).forEach(function (r) { sent[smsKey_(r[0], r[1], r[5])] = true; });
  return { appts: appts, byToken: byToken, phones: phones, sent: sent };
}
