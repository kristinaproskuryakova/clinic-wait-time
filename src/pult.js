/**
 * ПУЛЬТ (служебная страница): демо-время, «+3 минуты», «Имитация сбоя», ручной пересчёт и публикация.
 * Страница вызывает pultAction с ключом служебных страниц — без правильного ключа ничего не делает.
 */
function pultAction(key, action) {
  if (!isStaffKey_(key)) throw new Error('Нет доступа');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var n = now_();
    if (action === 'plus3') n = plusThreeMinutes_();
    if (action === 'cycle') { recalc_(n); publish_(n); smsStep_(n); }
    if (action === 'failOn') setFailureSimulated_(true);
    if (action === 'failOff') { setFailureSimulated_(false); recalc_(n); publish_(n); }
    var arrived = null;
    if (action === 'arrivals') { arrived = demoArrivals_(n); recalc_(n); publish_(n); }
    var st = pultState_();
    if (arrived !== null) st.message = 'Отмечено «пришёл»: ' + arrived;
    return st;
  } finally {
    lock.releaseLock();
  }
}

/** Что показывает пульт. */
function pultState_() {
  var n = now_();
  var published = publishedAt_();
  var timer = false;
  try {
    timer = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'onTimer'; });
  } catch (e) { /* таймер ещё не разрешён */ }
  return {
    now: formatDateTime_(n),
    demo: isDemoTime_(),
    publishedAt: published ? formatDateTime_(published) : '—',
    minutesSincePublish: published ? Math.floor((n - published) / 60000) : null,
    stale: isStale_(n),
    working: isWorkingTime_(n),
    failure: isFailureSimulated_(),
    timer: timer,
  };
}
