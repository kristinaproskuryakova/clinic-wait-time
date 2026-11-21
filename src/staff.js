/**
 * Доступ к служебным страницам: ссылка с секретным ключом.
 * Ключ хранится только в свойствах скрипта (Apps Script), не в коде и не на GitHub.
 */

var STAFF_KEY_PROP = 'STAFF_KEY';

/** Ключ служебных страниц. Создаётся при первом обращении. */
function staffKey_() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty(STAFF_KEY_PROP);
  if (!key) {
    key = generateToken_() + generateToken_(); // 40 случайных символов
    props.setProperty(STAFF_KEY_PROP, key);
  }
  return key;
}

/** Правильный ли ключ пришёл в ссылке. */
function isStaffKey_(key) {
  var stored = PropertiesService.getScriptProperties().getProperty(STAFF_KEY_PROP);
  return !!stored && key === stored;
}

/** Ссылка на служебную страницу. */
function staffUrl_(page) {
  return CONFIG.WEB_APP_URL + '?page=' + encodeURIComponent(page) + '&key=' + encodeURIComponent(staffKey_());
}

/** Пункт меню «Служебные ссылки»: окно со ссылками для сотрудников. */
function menuShowStaffLinks() {
  var ui = SpreadsheetApp.getUi();
  var links = [
    ['Регистратура', staffUrl_('registry')],
    ['Пульт (демо-время, +3 минуты, сбой)', staffUrl_('pult')],
    ['Проверки (тесты по номерам)', staffUrl_('checks')],
  ].concat(readRows_(SHEETS.DOCTORS).filter(function (d) { return d[0]; }).map(function (d) {
    return ['Врач: ' + d[0], staffUrl_('doctor') + '&d=' + encodeURIComponent(d[0])];
  }), departments_().map(function (dep) { return ['Экран: ' + dep, screenUrl_(dep)]; }));
  var html = '<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5">' +
    '<p>Эти ссылки — только для сотрудников. Не отправляй их пациентам.</p>' +
    links.map(function (l) {
      return '<p><b>' + l[0] + '</b><br><a href="' + l[1] + '" target="_blank">открыть</a></p>';
    }).join('') + '</div>';
  ui.showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(440).setHeight(620), 'Служебные ссылки');
}

/**
 * Пункт меню «Ссылка пациента»: ссылка на страницу пациента для выделенной строки листа «Приёмы».
 * Так на этапе 2 можно открыть страницу на телефоне (на этапе 7 ссылка будет в «Журнале SMS»).
 */
function menuShowPatientLink() {
  var ui = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSheet();
  var row = sheet.getActiveCell().getRow();
  if (sheet.getName() !== SHEETS.APPOINTMENTS || row < 2) {
    ui.alert('Открой лист «Приёмы» и встань на строку нужного приёма.');
    return;
  }
  var r = sheet.getRange(row, 1, 1, COLUMNS[SHEETS.APPOINTMENTS].length).getValues()[0];
  var url = CONFIG.WEB_APP_URL + '?t=' + r[apptCol_('Токен')];
  var html = '<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5">' +
    '<p>Номер ' + r[apptCol_('Номер')] + ' · ' + r[apptCol_('Врач')] + ' · статус «' + r[apptCol_('Статус')] + '»</p>' +
    '<p><a href="' + url + '" target="_blank">Открыть страницу пациента</a></p>' +
    '<p style="word-break:break-all;color:#555">' + url + '</p></div>';
  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(460).setHeight(230), 'Ссылка пациента');
}
