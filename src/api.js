/**
 * СЕРВЕРНАЯ ЧАСТЬ ДЛЯ СТРАНИЦ. Только эти функции страницы могут вызывать (их имена без «_» в конце).
 * Каждая отдаёт ровно то, что нужно странице, и ничего больше.
 */

/**
 * Данные для страницы пациента по токену из ссылки.
 * Ответ: { state: 'ok', view } | { state: 'invalid' } | { state: 'blocked', minutes }.
 * deviceId — метка браузера; по ней считаем неверные попытки (тест 31).
 */
function getPatientView(token, deviceId) {
  var device = /^[A-Za-z0-9-]{8,64}$/.test(String(deviceId)) ? String(deviceId) : 'no-device';
  var cache = CacheService.getScriptCache();
  var failKey = 'bad:' + device;
  var fails = Number(cache.get(failKey)) || 0;
  if (fails >= CONFIG.MAX_BAD_ATTEMPTS) {
    return { state: 'blocked', minutes: CONFIG.BLOCK_MIN };
  }

  var appt = isTokenFormat_(token) ? findAppointment_(token) : null;
  if (!appt) {
    // Счётчик живёт BLOCK_MIN минут с последней неверной попытки.
    cache.put(failKey, String(fails + 1), CONFIG.BLOCK_MIN * 60);
    return { state: 'invalid' };
  }
  var n = now_();
  var view = buildPatientView_(appt, n);
  // Заглушка (тест 34): для сегодняшнего приёма, если публикации не было STALE_MIN минут.
  var stale = (view.kind === 'today' || view.kind === 'delayed' || view.kind === 'late') && isStale_(n);
  return { state: 'ok', view: view, stale: stale, refreshSec: CONFIG.PAGE_REFRESH_SEC };
}

/** Один приём по токену — только нужные поля. null, если такого токена нет. */
function findAppointment_(token) {
  var rows = readRows_(SHEETS.APPOINTMENTS);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][apptCol_('Токен')] === token) return apptFromRow_(rows[i]);
  }
  return null;
}

/** Строка «Приёмов» → приём для страницы и экрана. Без телефона и токена. */
function apptFromRow_(r) {
  var c = apptCol_;
  return {
    number: r[c('Номер')],
    doctor: r[c('Врач')],
    department: r[c('Отделение')],
    at: r[c('Дата и время приёма')],
    status: normalizeStatus_(r[c('Статус')]),
    startedAt: r[c('Начало')],
    shownLower: r[c('Ниж. (показ)')],   // опубликованный интервал (этап 3)
    shownUpper: r[c('Верх. (показ)')],
    arrivedAt: r[c('Пришёл')],          // отметка регистратуры (этап 5)
    lateRef: r[c('Опоздание от')],
  };
}
