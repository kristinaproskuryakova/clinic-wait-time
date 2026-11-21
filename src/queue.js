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

/** Длительность приёма из листа «Настройки» (или из config.js, если там пусто). */
function durationMin() {
  var v = Number(readSetting('Длительность приёма, мин'));
  return v > 0 ? v : CONFIG.DEFAULT_DURATION_MIN;
}

/** Значение параметра из листа «Настройки» по названию. */
function readSetting(name) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.SETTINGS);
  if (!sheet || sheet.getLastRow() < 2) return '';
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][0] === name) return rows[i][1];
  }
  return '';
}

/** Все строки листа без заголовка. */
function readRows(sheetName) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, COLUMNS[sheetName].length).getValues();
}

/**
 * Система записи → сервис: для каждой новой записи в «Записях» создаёт приём в «Приёмах».
 * Сервис выдаёт номер в очереди и берёт 4 последние цифры телефона.
 * Возвращает, сколько приёмов создано.
 */
function syncFromBookings() {
  var bookings = readRows(SHEETS.BOOKINGS);
  var appts = readRows(SHEETS.APPOINTMENTS);
  var known = {};
  var used = [];
  appts.forEach(function (r) {
    known[r[apptCol_('Токен')]] = true;
    if (OPEN_STATUSES.indexOf(r[apptCol_('Статус')]) >= 0) used.push(r[apptCol_('Номер')]);
  });

  var duration = durationMin();
  var fresh = [];
  bookings.forEach(function (b) {
    var token = b[0];
    if (!token || known[token]) return;
    var number = lowestFreeNumber(used, CONFIG.QUEUE_NUMBER_MAX);
    used.push(number);
    known[token] = true;
    // Порядок как в COLUMNS['Приёмы'].
    fresh.push([token, number, b[6], b[3], b[4], duration, phoneLast4(b[7]),
      '', '', '', '', '', STATUS.WAITING]);
  });

  if (fresh.length) {
    var sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.APPOINTMENTS);
    sheet.getRange(sheet.getLastRow() + 1, 1, fresh.length, fresh[0].length).setValues(fresh);
    formatSheets_();
  }
  return fresh.length;
}
