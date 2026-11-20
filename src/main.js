/**
 * Вход в веб-приложение: Google вызывает doGet, когда открывают ссылку.
 * На этапе 0 — только проверочная страница «Работает».
 */
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('status')
    .setTitle('Clinic Wait Time')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
