/**
 * ЕДИНОЕ ВРЕМЯ. Все модули узнают «сейчас» только через now(). Часы напрямую никто не берёт.
 *
 * Как работает демо-время:
 *  - ячейка «Демо-время» в листе «Настройки» пустая → настоящие часы;
 *  - вписали время (например 15:00) → скрипт запоминает сдвиг «демо минус настоящие часы»,
 *    и дальше «сейчас» = настоящие часы + сдвиг, то есть время идёт от 15:00 как обычные часы;
 *  - addDemoMinutes(3) прибавляет 3 минуты к сдвигу (кнопка «+3 минуты», этап 3).
 */

var DEMO_PROP_TEXT = 'DEMO_TIME_TEXT';     // что было вписано в ячейку, когда считали сдвиг
var DEMO_PROP_OFFSET = 'DEMO_OFFSET_MS';   // сдвиг в миллисекундах
var DEMO_SETTING_NAME = 'Демо-время';

/** Текущее время для всех модулей. */
function now() {
  return computeNow(Date.now(), currentDemoOffsetMs_());
}

/** Включено ли демо-время. */
function isDemoTime() {
  return readDemoCellText_() !== '';
}

/** Прибавить минуты к демо-времени (кнопка «+3 минуты»). Если демо-время не включено, включает его. */
function addDemoMinutes(minutes) {
  var props = PropertiesService.getScriptProperties();
  var offset = currentDemoOffsetMs_();
  if (!isDemoTime()) {
    // Включаем демо-время от настоящих часов.
    var text = formatDateTime(new Date());
    writeDemoCellText_(text);
    props.setProperty(DEMO_PROP_TEXT, text);
    offset = 0;
  }
  props.setProperty(DEMO_PROP_OFFSET, String(offset + minutes * 60000));
  return now();
}

/** «Сейчас» из настоящих часов и сдвига. Отдельная функция, чтобы её можно было проверить. */
function computeNow(realMs, offsetMs) {
  return new Date(realMs + (offsetMs || 0));
}

/**
 * Разбирает текст демо-времени: «20.11.2026 15:00», «20.11.2026 15:00:30» или «15:00» (тогда дата — today).
 * Возвращает Date или null, если текст непонятен.
 */
function parseDemoTime(text, today) {
  var s = String(text).trim();
  var m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2})[:.](\d{2})(?::(\d{2}))?$/);
  if (m) {
    return validDate_(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0));
  }
  m = s.match(/^(\d{1,2})[:.](\d{2})(?::(\d{2}))?$/);
  if (m) {
    return validDate_(today.getFullYear(), today.getMonth(), today.getDate(), +m[1], +m[2], +(m[3] || 0));
  }
  return null;
}

/** Дата и время в виде «20.11.2026 15:00». */
function formatDateTime(d) {
  return pad2_(d.getDate()) + '.' + pad2_(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' +
    pad2_(d.getHours()) + ':' + pad2_(d.getMinutes());
}

/** Время в виде «15:00». */
function formatTime(d) {
  return pad2_(d.getHours()) + ':' + pad2_(d.getMinutes());
}

/**
 * Срабатывает само, когда в таблице что-то меняют руками.
 * Если поменяли «Демо-время» — сразу запоминаем сдвиг, чтобы время пошло ровно от вписанного.
 */
function onEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  if (sheet.getName() !== SHEETS.SETTINGS) return;
  if (sheet.getRange(e.range.getRow(), 1).getValue() !== DEMO_SETTING_NAME) return;
  currentDemoOffsetMs_();
}

// ---------- внутреннее ----------

/** Сдвиг демо-времени. Если ячейку поменяли, а сдвиг ещё не пересчитан — пересчитывает. */
function currentDemoOffsetMs_() {
  var props = PropertiesService.getScriptProperties();
  var text = readDemoCellText_();
  if (text === '') {
    if (props.getProperty(DEMO_PROP_TEXT) !== null) {
      props.deleteProperty(DEMO_PROP_TEXT);
      props.deleteProperty(DEMO_PROP_OFFSET);
    }
    return 0;
  }
  if (text !== props.getProperty(DEMO_PROP_TEXT)) {
    var realNow = Date.now();
    var demo = parseDemoTime(text, new Date(realNow));
    if (!demo) {
      throw new Error('Не понимаю демо-время «' + text + '». Пример: 20.11.2026 15:00 или 15:00.');
    }
    props.setProperty(DEMO_PROP_TEXT, text);
    props.setProperty(DEMO_PROP_OFFSET, String(demo.getTime() - realNow));
  }
  return Number(props.getProperty(DEMO_PROP_OFFSET)) || 0;
}

function demoCell_() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.SETTINGS);
  if (!sheet) return null;
  var names = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 1).getValues();
  for (var i = 0; i < names.length; i++) {
    if (names[i][0] === DEMO_SETTING_NAME) return sheet.getRange(i + 1, 2);
  }
  return null;
}

function readDemoCellText_() {
  var cell = demoCell_();
  if (!cell) return '';
  var v = cell.getValue();
  if (v instanceof Date) return formatDateTime(v); // таблица сама превратила текст в дату
  return String(v).trim();
}

function writeDemoCellText_(text) {
  var cell = demoCell_();
  if (cell) cell.setNumberFormat('@').setValue(text);
}

function validDate_(y, mo, d, h, mi, s) {
  if (mo < 0 || mo > 11 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  var date = new Date(y, mo, d, h, mi, s);
  return date.getDate() === d ? date : null;
}

function pad2_(n) {
  return (n < 10 ? '0' : '') + n;
}
