/**
 * ОПОЗДАНИЕ ПАЦИЕНТА (requirements.md, «Опоздание и неявка»; тесты 19, 20, 21, 46).
 * Чистые функции: без таблицы, проверяются на компьютере.
 *
 * Опорное время опоздания = верхняя граница последнего опубликованного интервала (или назначенное время,
 * если интервала нет). Как только граница «вовремя» прошла, а пациент не пришёл, опорное время
 * фиксируется в колонке «Опоздание от» и дальше не двигается.
 *   «вовремя»       — приход до опорного времени + LATE_GRACE_MIN (5 минут);
 *   «опоздал 20+»   — опорное время + LATE_SMS_MIN (20 минут) прошло, а пациента нет.
 *
 * appt: { at, status, arrivedAt, lateRef, shownLower, shownUpper }
 */

/** Опорное время опоздания. */
function lateRef_(a) {
  if (isDate_(a.lateRef)) return a.lateRef;                         // уже зафиксировано
  if (isDate_(a.shownUpper) && isDate_(a.shownLower) && a.shownUpper > a.shownLower) return a.shownUpper;
  return a.at;
}

/** Граница «вовремя»: опорное время + 5 минут (тест 19). */
function onTimeDeadline_(a) {
  return addMin_(lateRef_(a), CONFIG.LATE_GRACE_MIN);
}

/** Ждём ли пациента: приём сегодня ещё не начался и не закрыт. */
function isPending_(a) {
  return a.status === STATUS.WAITING || a.status === STATUS.ARRIVED || a.status === STATUS.RESCHEDULED;
}

/** Пришёл позже границы «вовремя» (тест 20). */
function isLateArrival_(a) {
  return isDate_(a.arrivedAt) && a.arrivedAt > onTimeDeadline_(a);
}

/** Не пришёл, а граница «вовремя» уже прошла. Такой пациент не занимает место в прогнозе. */
function isAbsentLate_(a, n) {
  return isPending_(a) && !isDate_(a.arrivedAt) && n > onTimeDeadline_(a);
}

/** Опоздал на 20+ минут и не пришёл: подсветка в регистратуре (тест 46), SMS — на этапе 7 (тест 21). */
function isLate20_(a, n) {
  return isPending_(a) && !isDate_(a.arrivedAt) && n >= addMin_(lateRef_(a), CONFIG.LATE_SMS_MIN);
}

/**
 * Пора SMS об опоздании (тест 21): прошло 20+ минут от опорного времени. SMS уходит, даже если пациент
 * отметился в эту же минуту или позже — пришёл после 20-минутной границы.
 */
function isLateSmsDue_(a, n) {
  var mark = addMin_(lateRef_(a), CONFIG.LATE_SMS_MIN);
  if (!isPending_(a) || n < mark) return false;
  return !isDate_(a.arrivedAt) || a.arrivedAt >= mark;
}

/** Текст об опоздании для страницы пациента (решение Б10). */
function lateMessage_(a) {
  return 'Похоже, вы опаздываете на прием к врачу ' + a.doctor + ', назначенный на ' +
    patientTime_(a.at) + ' ' + patientDate_(a.at) +
    '. Прием может быть сокращен. Вы можете перенести запись на более удобное для вас время';
}
