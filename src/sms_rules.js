/**
 * SMS: КОГДА И ЧТО ОТПРАВЛЯТЬ (requirements.md, «SMS»; тесты 15–18, 21, 44).
 * Чистые функции: без таблицы, проверяются на компьютере. Сама «отправка» (строка в журнале) — в sms.js.
 */

var SMS = {
  CONFIRM: 'подтверждение записи',
  REMIND3: 'напоминание за 3 дня',
  REMIND1: 'напоминание за 1 день',
  LATE: 'опоздание',
  DELAY: 'задержка',
};

/**
 * Напоминания (решение Б15): в 10.00 за 3 дня и за 1 день; в день создания записи (и раньше) не шлём.
 * Получается: запись день в день или за 1 день → без напоминаний; за 2–3 дня → за 1 день; за 4+ → оба (тест 15).
 */
function smsReminderPlan_(createdAt, at) {
  var out = [];
  [[SMS.REMIND3, 3], [SMS.REMIND1, 1]].forEach(function (p) {
    var day = new Date(at.getFullYear(), at.getMonth(), at.getDate() - p[1]);
    if (isDate_(createdAt) && daysBetween_(createdAt, day) <= 0) return; // день создания записи или раньше
    out.push({ type: p[0], sendAt: atMinutes_(day, minutesOf_(CONFIG.REMINDER_TIME)) });
  });
  return out;
}

/**
 * Какие SMS пора отправить сейчас (кроме подтверждения — оно уходит при записи и переносе).
 * appts: приёмы с полями apptFromRow_ + token + createdAt. Повторы отсекает sms.js по журналу.
 *  - напоминание: время отправки наступило сегодня, приём ещё впереди;
 *  - опоздание: пациент опоздал на 20+ минут (тест 21) — уходит, даже если он в эту минуту входит;
 *  - задержка: у врача задержка → всем его ожидающим пациентам, у кого до назначенного времени 30–120 минут
 *    (тест 17; решение Б11: и тем, кто попал в это окно позже, пока задержка действует).
 */
function dueSms_(appts, n) {
  var out = [];
  var byDoctor = {};
  appts.forEach(function (a) {
    if (!isDate_(a.at)) return;
    if (isPending_(a) && a.at > n) {
      smsReminderPlan_(a.createdAt, a.at).forEach(function (r) {
        if (r.sendAt <= n && daysBetween_(r.sendAt, n) === 0) out.push({ token: a.token, type: r.type });
      });
    }
    if (daysBetween_(n, a.at) !== 0) return;
    if (isLateSmsDue_(a, n)) out.push({ token: a.token, type: SMS.LATE });
    (byDoctor[a.doctor] = byDoctor[a.doctor] || []).push(a);
  });
  Object.keys(byDoctor).forEach(function (doc) {
    var list = byDoctor[doc];
    if (!doctorDelay_(list)) return;
    list.forEach(function (a) {
      if (!isPending_(a) || isDate_(a.startedAt)) return;
      var minutes = (a.at - n) / 60000;
      if (minutes >= CONFIG.DELAY_SMS_FROM_MIN && minutes <= CONFIG.DELAY_SMS_TO_MIN) {
        out.push({ token: a.token, type: SMS.DELAY });
      }
    });
  });
  return out;
}

/** Ключ «одно SMS этого типа на этот приём» (тест 18). После переноса дата другая — можно снова. */
function smsKey_(token, type, at) {
  return token + '|' + type + '|' + (isDate_(at) ? formatDateTime_(at) : '');
}

/** Тема и текст SMS (решение Б13; напоминание — текст из Б15). В тексте — номер и полная ссылка. */
function smsText_(type, a, link, shownTime) {
  var when = patientDate_(a.at) + ' в ' + patientTime_(a.at);
  switch (type) {
    case SMS.CONFIRM:
      return { subject: 'Запись подтверждена', text: 'Вы записаны к врачу ' + a.doctor + ' на ' + when +
        '. Ваш номер ' + a.number + '. Отслеживайте статус в очереди в реальном времени ' + link };
    case SMS.REMIND3:
    case SMS.REMIND1:
      return { subject: 'Напоминание о приёме', text: 'Напоминаем о записи к доктору ' + a.doctor + ' в ' +
        patientDate_(a.at) + ' ' + patientTime_(a.at) + '. Ваш номер ' + a.number +
        '. Отслеживайте статус в очереди в реальном времени ' + link };
    case SMS.LATE:
      return { subject: 'Вы опаздываете на приём', text: 'Похоже, вы опаздываете на приём к врачу ' + a.doctor +
        ', назначенный на ' + patientTime_(a.at) + '. Вы можете перенести или отменить приём: ' + link };
    case SMS.DELAY:
      return { subject: 'Приём задерживается', text: 'Сегодня приём у врача ' + a.doctor + ' задерживается. Ваш номер ' +
        a.number + ', ориентировочное время ' + shownTime + '. Следите за очередью: ' + link };
  }
  throw new Error('Неизвестный тип SMS: ' + type);
}

/** Ссылка на страницу пациента — полная и рабочая, её можно переслать партнёру (CLAUDE.md). */
function patientLink_(token) {
  return CONFIG.WEB_APP_URL + '?t=' + token;
}
