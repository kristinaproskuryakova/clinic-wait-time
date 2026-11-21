/**
 * Вход в веб-приложение: Google вызывает doGet, когда открывают ссылку.
 *  - ?t=ТОКЕН                       → страница пациента;
 *  - ?page=reschedule&t=ТОКЕН       → страница-заглушка «Перенести или отменить»;
 *  - ?screen=ОТДЕЛЕНИЕ              → экран отделения (табло);
 *  - ?page=pult&key=…               → служебная страница «Пульт»;
 *  - ?page=registry&key=…           → служебная страница «Регистратура»;
 *  - ?page=doctor&d=ВРАЧ&key=…      → служебная страница врача;
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
  if (p.page === 'doctor') {
    if (!isStaffKey_(p.key)) return page_(HtmlService.createHtmlOutput('<p style="font-family:sans-serif">Нет доступа.</p>'), 'Нет доступа');
    var dt = HtmlService.createTemplateFromFile('doctor_page');
    dt.key = p.key;
    dt.doctor = String(p.d || '').slice(0, 80);
    return page_(dt.evaluate(), 'Врач: ' + dt.doctor);
  }
  if (p.page === 'registry') {
    if (!isStaffKey_(p.key)) return page_(HtmlService.createHtmlOutput('<p style="font-family:sans-serif">Нет доступа.</p>'), 'Нет доступа');
    var g = HtmlService.createTemplateFromFile('registry_page');
    g.key = p.key;
    return page_(g.evaluate(), 'Регистратура');
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
  if (p.api === 'screen') {
    // Данные экрана в виде JSON (на экране нет личных данных). Пригодится и при переезде на GitHub Pages.
    var out;
    try { out = getScreenView(String(p.d || '')); } catch (err) { out = { state: 'error', message: err.message }; }
    return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
  }
  if (p.screen !== undefined) {
    var s = HtmlService.createTemplateFromFile('screen_page');
    s.department = String(p.screen).slice(0, 60);
    s.staleMin = CONFIG.STALE_MIN;
    return page_(s.evaluate(), 'Экран: ' + s.department);
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
