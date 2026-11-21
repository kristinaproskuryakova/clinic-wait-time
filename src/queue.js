/**
 * СЕРВИС ОЧЕРЕДИ. Ядро: все модули работают с приёмами только через эти функции.
 * Лист «Приёмы» хранит только 4 последние цифры телефона, имени здесь нет.
 */

/** Номера колонок листа «Приёмы» (с 0) по названию. */
function apptCol_(name) {
  var i = COLUMNS[SHEETS.APPOINTMENTS].indexOf(name);
  if (i < 0) throw new Error('Нет колонки «' + name + '» в листе «Приёмы»');
  return i;
}

/**
 * Статус из таблицы → один из STATUS. Не важны регистр, лишние пробелы и «ё»/«е»:
 * «Перенесен », «перенесён» и «ПЕРЕНЕСЁН» — одно и то же. Неизвестный текст → ''.
 */
function normalizeStatus_(raw) {
  var key = function (s) { return String(s).trim().toLowerCase().replace(/ё/g, 'е'); };
  var k = key(raw);
  var all = Object.keys(STATUS).map(function (name) { return STATUS[name]; });
  for (var i = 0; i < all.length; i++) {
    if (key(all[i]) === k) return all[i];
  }
  return '';
}

/** Незакрыт ли приём (номер в очереди занят). */
function isOpenStatus_(raw) {
  return OPEN_STATUSES.indexOf(normalizeStatus_(raw)) >= 0;
}

/** Длительность приёма из листа «Настройки» (или из config.js, если там пусто). */
function durationMin_() {
  var v = Number(readSetting_('Длительность приёма, мин'));
  return v > 0 ? v : CONFIG.DEFAULT_DURATION_MIN;
}

/** Значение параметра из листа «Настройки» по названию. */
function readSetting_(name) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.SETTINGS);
  if (!sheet || sheet.getLastRow() < 2) return '';
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === name) return rows[i][1];
  }
  return '';
}

/** Все строки листа без заголовка. */
function readRows_(sheetName) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, COLUMNS[sheetName].length).getValues();
}

/**
 * Система записи → сервис: для каждой новой записи в «Записях» создаёт приём в «Приёмах».
 * Сервис выдаёт номер в очереди и берёт 4 последние цифры телефона.
 * Возвращает, сколько приёмов создано.
 */
function syncFromBookings_() {
  var bookings = readRows_(SHEETS.BOOKINGS);
  var appts = readRows_(SHEETS.APPOINTMENTS);
  var known = {};
  var used = [];
  appts.forEach(function (r) {
    known[r[apptCol_('Токен')]] = true;
    if (isOpenStatus_(r[apptCol_('Статус')])) used.push(r[apptCol_('Номер')]);
  });

  var duration = durationMin_();
  var fresh = [];
  bookings.forEach(function (b) {
    var token = b[0];
    if (!token || known[token]) return;
    var number = lowestFreeNumber_(used, CONFIG.QUEUE_NUMBER_MAX);
    used.push(number);
    known[token] = true;
    // Порядок как в COLUMNS['Приёмы'].
    var row = [token, number, b[6], b[3], b[4], duration, phoneLast4_(b[7]),
      '', '', '', '', '', STATUS.WAITING];
    while (row.length < COLUMNS[SHEETS.APPOINTMENTS].length) row.push('');
    fresh.push(row);
  });

  if (fresh.length) {
    var sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.APPOINTMENTS);
    sheet.getRange(sheet.getLastRow() + 1, 1, fresh.length, fresh[0].length).setValues(fresh);
    formatSheets_();
    // Подтверждение записи (тест 15): уходит в момент создания записи.
    var created = {};
    bookings.forEach(function (b) { created[b[0]] = b[5]; });
    var n = now_();
    sendConfirmations_(fresh.map(function (row) {
      var at = created[row[0]];
      return { token: row[0], sentAt: isDate_(at) && at <= n ? at : n };
    }));
  }
  return fresh.length;
}
