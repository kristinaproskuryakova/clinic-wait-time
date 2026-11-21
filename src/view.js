/**
 * ЧТО ВИДИТ ПАЦИЕНТ: из строки приёма и текущего времени собирает то, что покажет страница.
 * Только номер, врач, отделение, время и сообщение — никаких имён, телефонов и токенов (тест 27).
 * Тексты статусов — из requirements.md, раздел «Статусы страницы» (тест 22).
 *
 * appt — { number, doctor, department, at: Date приёма, status, startedAt: Date|'' }
 * Интервал и «задерживается» добавятся на этапе 3 (прогноз).
 */
function buildPatientView_(appt, nowDate) {
  var at = appt.at;
  var view = {
    number: appt.number,
    doctor: appt.doctor,
    department: appt.department,
    dateText: patientDate_(at),
    timeText: patientTime_(at),
    message: '',
    kind: 'planned',
  };
  var dayDiff = daysBetween_(nowDate, at);

  switch (appt.status) {
    case STATUS.CANCELLED:
    case STATUS.NO_SHOW: // пациент с неявкой видит то же, что при отмене (тест 23)
      view.kind = 'cancelled';
      view.message = 'Приём отменён';
      return view;
    case STATUS.DONE:
      var done = isDate_(appt.startedAt) ? appt.startedAt : at;
      view.kind = 'done';
      view.message = 'Приём состоялся ' + patientDate_(done) + ' в ' + patientTime_(done);
      return view;
    case STATUS.IN_PROGRESS:
      view.kind = 'in_progress';
      view.message = 'Ваш приём идёт';
      return view;
    case STATUS.RESCHEDULED:
      if (dayDiff > 0) {
        view.kind = 'rescheduled';
        view.message = 'Перенесён на ' + patientDate_(at) + ' в ' + patientTime_(at) +
          ', осталось ' + dayDiff + ' ' + plural_(dayDiff, 'день', 'дня', 'дней');
        return view;
      }
      break; // в новый день приёма — как обычный приём
  }

  // «Ожидается» и «пришёл» пациент видит одинаково.
  if (dayDiff > 0) {
    view.kind = 'before_day';                  // до дня приёма: дата и время (тест 35)
    return view;
  }
  if (dayDiff < 0) {
    view.kind = 'past';                        // день прошёл, а статус не закрыт — только дата и время
    return view;
  }
  view.kind = 'today';
  view.dateText = 'Сегодня';
  view.message = 'Ваш приём назначен на ' + patientTime_(at) + ', приходите вовремя';
  return view;
}

/** Время для пациента: «12.00» (как в requirements.md). */
function patientTime_(d) {
  return d.getHours() + '.' + pad2_(d.getMinutes());
}

/** Дата для пациента: «25.11.2026». */
function patientDate_(d) {
  return pad2_(d.getDate()) + '.' + pad2_(d.getMonth() + 1) + '.' + d.getFullYear();
}

/** Сколько календарных дней от сегодня до дня приёма (0 — сегодня, отрицательное — прошёл). */
function daysBetween_(from, to) {
  var a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  var b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86400000);
}

/** Это дата (а не пустая ячейка или текст)? */
function isDate_(v) {
  return !!v && typeof v.getTime === 'function' && !isNaN(v.getTime());
}

/** 1 день, 2 дня, 5 дней. */
function plural_(n, one, few, many) {
  var m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
