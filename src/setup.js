/**
 * Подготовка таблицы: создаёт листы с заголовками, если их ещё нет.
 * Уже заполненные листы не трогает — данные не теряются.
 */

/** Создаёт все листы из COLUMNS. Можно запускать сколько угодно раз. */
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
  return 'Листы готовы';
}

/**
 * Меню «Clinic Wait Time» в таблице. Срабатывает само при открытии таблицы.
 * Из редактора скриптов её запускать не нужно.
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('Clinic Wait Time')
      .addItem('Создать листы', 'setupSheets')
      .addToUi();
  } catch (e) {
    // Запуск не из таблицы (например, из редактора) — меню не нужно.
  }
}
