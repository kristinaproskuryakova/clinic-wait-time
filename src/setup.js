/**
 * Подготовка таблицы и меню.
 */

/** Создаёт все листы из COLUMNS. Можно запускать сколько угодно раз: заполненные листы не трогает. */
function setupSheets() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(COLUMNS).forEach(function (name) {
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      var headers = COLUMNS[name];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sheet.setFrozenRows(1);
      if (name === SHEETS.SETTINGS) {
        sheet.getRange(2, 1, SETTINGS_ROWS.length, 3).setValues(SETTINGS_ROWS);
        sheet.getRange(2, 2, SETTINGS_ROWS.length, 1).setNumberFormat('@'); // значения как текст
      }
      sheet.autoResizeColumns(1, headers.length);
    }
  });
  // Пустой стандартный «Лист1» больше не нужен.
  var blank = ss.getSheetByName('Лист1') || ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) {
    ss.deleteSheet(blank);
  }
  formatSheets_();
  return 'Листы готовы';
}

/**
 * Часовой пояс таблицы = часовой пояс скрипта, форматы дат и текстовых колонок.
 * Без этого таблица могла бы показывать время в другом поясе.
 */
function formatSheets_() {
  var ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(Session.getScriptTimeZone());
  var dateTime = 'dd.MM.yyyy HH:mm';
  var formats = {
    'Записи': { 'Запись создана': dateTime, 'Дата и время приёма': dateTime, 'Телефон': '@' },
    'Врачи': { 'Кабинет': '@', 'Начало обеда': '@' },
    'Приёмы': { 'Дата и время приёма': dateTime, 'Телефон (4 цифры)': '@', 'Пришёл': 'HH:mm',
      'Начало': 'HH:mm', 'Окончание': 'HH:mm', 'Прогноз': 'HH:mm' },
    'Журнал SMS': { 'Отправлено': dateTime },
  };
  Object.keys(formats).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) return;
    var rows = Math.max(sheet.getMaxRows() - 1, 1);
    Object.keys(formats[name]).forEach(function (col) {
      var c = COLUMNS[name].indexOf(col) + 1;
      sheet.getRange(2, c, rows, 1).setNumberFormat(formats[name][col]);
    });
  });
}

/** Меню «Clinic Wait Time» в таблице. Срабатывает само при открытии таблицы. */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('Clinic Wait Time')
      .addItem('Создать демо-день', 'menuCreateDemoDay')
      .addItem('Обновить очередь из записей', 'menuSyncFromBookings')
      .addSeparator()
      .addItem('Служебные ссылки', 'menuShowStaffLinks')
      .addItem('Создать листы', 'setupSheets')
      .addToUi();
  } catch (e) {
    // Запуск не из таблицы (например, из редактора) — меню не нужно.
  }
}

function menuSyncFromBookings() {
  var n = syncFromBookings();
  SpreadsheetApp.getUi().alert('Создано новых приёмов: ' + n);
}
