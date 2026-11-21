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
  return { state: 'ok', view: buildPatientView_(appt, now_()) };
}

/** Один приём по токену — только нужные поля. null, если такого токена нет. */
function findAppointment_(token) {
  var rows = readRows_(SHEETS.APPOINTMENTS);
  var c = function (name) { return apptCol_(name); };
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r[c('Токен')] !== token) continue;
    return {
      number: r[c('Номер')],
      doctor: r[c('Врач')],
      department: r[c('Отделение')],
      at: r[c('Дата и время приёма')],
      status: normalizeStatus_(r[c('Статус')]),
      startedAt: r[c('Начало')],
    };
  }
  return null;
}
