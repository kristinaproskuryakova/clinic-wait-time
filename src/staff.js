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
    key = generateToken() + generateToken(); // 40 случайных символов
    props.setProperty(STAFF_KEY_PROP, key);
  }
  return key;
}

/** Правильный ли ключ пришёл в ссылке. */
function isStaffKey(key) {
  var stored = PropertiesService.getScriptProperties().getProperty(STAFF_KEY_PROP);
  return !!stored && key === stored;
}

/** Ссылка на служебную страницу. */
function staffUrl(page) {
  return CONFIG.WEB_APP_URL + '?page=' + encodeURIComponent(page) + '&key=' + encodeURIComponent(staffKey_());
}

/** Пункт меню «Служебные ссылки»: окно со ссылками для сотрудников. */
function menuShowStaffLinks() {
  var links = [
    ['Проверки (тесты по номерам)', staffUrl('checks')],
  ];
  var html = '<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5">' +
    '<p>Эти ссылки — только для сотрудников. Не отправляй их пациентам.</p>' +
    links.map(function (l) {
      return '<p><b>' + l[0] + '</b><br><a href="' + l[1] + '" target="_blank">открыть</a></p>';
    }).join('') + '</div>';
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(420).setHeight(200), 'Служебные ссылки');
}
