/**
 * ЭКРАН ОТДЕЛЕНИЯ (requirements.md, «Экраны отделений»; тесты 11, 12, 13, 34, 35).
 * Показывает приёмы ближайших двух часов (CONFIG.SCREEN_HORIZON_MIN) у врачей отделения: номер, время или интервал, кабинет, «Приём идёт».
 * Время берётся той же функцией buildPatientView_ и из той же публикации, что и на странице пациента,
 * поэтому для одного приёма экран и страница показывают одно и то же (тест 13).
 */

/**
 * Данные для экрана. Ответ:
 *  { state: 'ok', department, clock, items: [{ number, timeText, cabinet, kind }], refreshSec }
 *  | { state: 'closed' } (клиника закрыта — экран выключен, тест 35)
 *  | { state: 'stale' }  (нет публикаций 6 минут — заглушка, тест 34)
 *  | { state: 'unknown' } (такого отделения нет)
 */
function getScreenView(department) {
  var n = now_();
  var doctors = readRows_(SHEETS.DOCTORS);
  var known = doctors.some(function (d) { return d[1] === department; });
  if (!known) return { state: 'unknown' };
  if (!isWorkingTime_(n)) return { state: 'closed', department: department };
  if (isStale_(n)) return { state: 'stale', department: department, refreshSec: CONFIG.PAGE_REFRESH_SEC };

  var cabinets = {};
  doctors.forEach(function (d) { if (d[1] === department) cabinets[d[0]] = String(d[2]); });
  var items = screenItems_(readRows_(SHEETS.APPOINTMENTS).map(apptFromRow_), cabinets, n);
  return { state: 'ok', department: department, clock: formatTime_(n), items: items,
    refreshSec: CONFIG.PAGE_REFRESH_SEC };
}

/**
 * Какие приёмы попадают на экран (чистая функция — проверяется на компьютере).
 *  - врач из этого отделения (есть в cabinets), приём сегодня;
 *  - «Приём идёт» — всегда;
 *  - ещё не начавшийся — если ПОКАЗАННОЕ время (начало интервала или точное время) в ближайшие два часа (тест 12)
 *    и не прошла граница «вовремя»: верхняя граница показа (или назначенное время) + 5 минут.
 */
function screenItems_(appts, cabinets, n) {
  var horizon = addMin_(n, CONFIG.SCREEN_HORIZON_MIN);
  var list = [];
  appts.forEach(function (a) {
    if (!(a.doctor in cabinets) || !isDate_(a.at) || daysBetween_(n, a.at) !== 0) return;
    var view = buildPatientView_(a, n);
    if (view.kind === 'in_progress') {
      list.push({ at: a.at, number: a.number, timeText: 'Приём идёт', cabinet: cabinets[a.doctor], kind: view.kind });
      return;
    }
    if (view.kind !== 'today' && view.kind !== 'delayed' && view.kind !== 'late') return; // состоялся, отменён…
    if (isAbsentLate_(a, n)) return;                               // не пришёл к границе «вовремя» — убираем
    var interval = isDate_(a.shownUpper) && isDate_(a.shownLower) && a.shownUpper > a.shownLower;
    var shownFrom = interval ? a.shownLower : a.at;                // что видит пациент: начало интервала или время
    if (shownFrom >= horizon) return;                              // дальше двух часов — не показываем
    // Экран не показывает, что пациент опоздал: только его время (интервал или точное).
    var kind = view.kind === 'late' ? (interval ? 'delayed' : 'today') : view.kind;
    list.push({ at: a.at, number: a.number, timeText: view.timeText, cabinet: cabinets[a.doctor], kind: kind });
  });
  list.sort(function (x, y) {
    if ((x.kind === 'in_progress') !== (y.kind === 'in_progress')) return x.kind === 'in_progress' ? -1 : 1;
    return x.at - y.at;
  });
  return list.map(function (x) { return { number: x.number, timeText: x.timeText, cabinet: x.cabinet, kind: x.kind }; });
}

/** Отделения из листа «Врачи» (для ссылок на экраны). */
function departments_() {
  var seen = {};
  return readRows_(SHEETS.DOCTORS).map(function (d) { return d[1]; }).filter(function (dep) {
    if (!dep || seen[dep]) return false;
    seen[dep] = true;
    return true;
  });
}

/** Ссылка на экран отделения (без ключа: на экране нет персональных данных). */
function screenUrl_(department) {
  return CONFIG.WEB_APP_URL + '?screen=' + encodeURIComponent(department);
}
