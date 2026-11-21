/**
 * Вход в веб-приложение: Google вызывает doGet, когда открывают ссылку.
 *  - ?t=ТОКЕН                       → страница пациента;
 *  - ?page=reschedule&t=ТОКЕН       → страница-заглушка «Перенести или отменить»;
 *  - ?page=checks&key=…             → служебная страница «Проверки» (только с правильным ключом);
 *  - без параметров                 → проверочная страница «Работает».
 */
function doGet(e) {
  var p = (e && e.parameter) || {};
  var token = cleanToken_(p.t);

  if (p.page === 'checks') {
    if (!isStaffKey_(p.key)) return page_(HtmlService.createHtmlOutput('<p style="font-family:sans-serif">Нет доступа.</p>'), 'Нет доступа');
    var c = HtmlService.createTemplateFromFile('checks_page');
    c.results = runChecks_();
    c.nowText = formatDateTime_(now_());
    return page_(c.evaluate(), 'Проверки');
  }
  if (p.page === 'pult') {
    if (!isStaffKey_(p.key)) return page_(HtmlService.createHtmlOutput('<p style="font-family:sans-serif">Нет доступа.</p>'), 'Нет доступа');
    var u = HtmlService.createTemplateFromFile('pult_page');
    u.key = p.key;
    return page_(u.evaluate(), 'Пульт');
  }
  if (p.page === 'reschedule') {
    var r = HtmlService.createTemplateFromFile('reschedule_page');
    r.backUrl = token ? CONFIG.WEB_APP_URL + '?t=' + token : '';
    return page_(r.evaluate(), 'Перенести или отменить приём');
  }
  if (p.t !== undefined) {
    var t = HtmlService.createTemplateFromFile('patient_page');
    t.token = token;
    t.staleMin = CONFIG.STALE_MIN;
    t.rescheduleUrl = CONFIG.WEB_APP_URL + '?page=reschedule&t=' + token;
    return page_(t.evaluate(), 'Ваш приём');
  }
  return page_(HtmlService.createHtmlOutputFromFile('status'), 'Clinic Wait Time');
}

/** Из ссылки берём только буквы и цифры, не длиннее 64 символов: в страницу не попадёт ничего лишнего. */
function cleanToken_(raw) {
  return String(raw || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 64);
}

/** Вставка общего куска страницы (например, api_client) внутрь другой страницы. */
function include_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function page_(output, title) {
  return output.setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
