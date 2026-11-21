/**
 * Вход в веб-приложение: Google вызывает doGet, когда открывают ссылку.
 *  - без параметров → проверочная страница «Работает»;
 *  - ?page=checks&key=… → служебная страница «Проверки» (только с правильным ключом).
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.page === 'checks') {
    if (!isStaffKey(p.key)) return page_(HtmlService.createHtmlOutput('<p style="font-family:sans-serif">Нет доступа.</p>'));
    var t = HtmlService.createTemplateFromFile('checks_page');
    t.results = runChecks();
    t.nowText = formatDateTime(now());
    return page_(t.evaluate());
  }
  return page_(HtmlService.createHtmlOutputFromFile('status'));
}

function page_(output) {
  return output.setTitle('Clinic Wait Time')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
