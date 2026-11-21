/**
 * ПЕРЕСЧЁТ И ПУБЛИКАЦИЯ (тест 14).
 *  - пересчёт (минута 2 цикла): считает прогноз и пишет колонки «… (расчёт)»;
 *  - публикация (минута 3 цикла): копирует «расчёт» в «показ» и запоминает время публикации.
 * Страницы и экраны читают только «показ», поэтому всегда видят одно и то же (тест 13).
 * Таймер Apps Script срабатывает раз в минуту и сам решает, пора ли шагу (onTimer).
 */

var PROP_PUBLISHED_AT = 'PUBLISHED_AT';       // демо-время последней публикации, мс
var PROP_LAST_RECALC = 'LAST_RECALC_CYCLE';   // «дата:номер цикла» последнего пересчёта
var PROP_LAST_PUBLISH = 'LAST_PUBLISH_CYCLE'; // «дата:номер цикла» последней публикации

/** Срабатывает по таймеру раз в минуту. Пересчёт и публикация — только в часы работы клиники. */
function onTimer() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    var n = now_();
    runCycleSteps_(n);
    smsStep_(n);
  } finally {
    lock.releaseLock();
  }
}

/** Выполняет шаги цикла, которые уже наступили и ещё не сделаны. */
function runCycleSteps_(n) {
  if (!isWorkingTime_(n)) return;
  var step = cycleStep_(n, minutesOf_(openTime_()));
  var props = PropertiesService.getScriptProperties();
  var day = formatDateTime_(n).slice(0, 10) + ':';
  if (step.recalc >= 0 && props.getProperty(PROP_LAST_RECALC) !== day + step.recalc) {
    recalc_(n);
    props.setProperty(PROP_LAST_RECALC, day + step.recalc);
  }
  if (step.publish >= 0 && props.getProperty(PROP_LAST_PUBLISH) !== day + step.publish) {
    publish_(n);
    props.setProperty(PROP_LAST_PUBLISH, day + step.publish);
  }
}

/** Кнопка «+3 минуты» (решение Б1): сдвигает демо-время и сразу пересчитывает и публикует. */
function plusThreeMinutes_() {
  var n = addDemoMinutes_(CONFIG.CYCLE_MIN);
  recalc_(n);
  publish_(n);
  smsStep_(n);
  return n;
}

/** Пересчёт: прогноз для сегодняшних приёмов каждого врача → колонки «… (расчёт)». */
function recalc_(n) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.APPOINTMENTS);
  var rows = readRows_(SHEETS.APPOINTMENTS);
  if (!rows.length) return 0;
  var c = apptCol_;
  var lunch = doctorLunches_();
  var byDoctor = {};
  var lateRefs = rows.map(function (r) { return [r[c('Опоздание от')]]; });
  rows.forEach(function (r, i) {
    var at = r[c('Дата и время приёма')];
    if (!isDate_(at) || daysBetween_(n, at) !== 0) return;
    var doc = r[c('Врач')];
    var appt = apptFromRow_(r);
    var absent = isAbsentLate_(appt, n);
    if (absent && !isDate_(appt.lateRef)) lateRefs[i] = [lateRef_(appt)]; // граница прошла — фиксируем
    (byDoctor[doc] = byDoctor[doc] || []).push({
      key: i, at: at, duration: Number(r[c('Длительность, мин')]) || durationMin_(),
      status: appt.status, startedAt: r[c('Начало')], endedAt: r[c('Окончание')],
      arrivedAt: appt.arrivedAt,
      skip: absent,   // не пришёл к границе «вовремя» — место в прогнозе не занимает
    });
  });
  sheet.getRange(2, c('Опоздание от') + 1, lateRefs.length, 1).setValues(lateRefs);

  var out = rows.map(function () { return ['', '', '']; }); // Прогноз, Ниж. (расчёт), Верх. (расчёт)
  Object.keys(byDoctor).forEach(function (doc) {
    var res = forecastDoctorDay_(byDoctor[doc], lunch[doc], n);
    Object.keys(res).forEach(function (key) {
      out[key] = [res[key].forecast, res[key].lower, res[key].upper];
    });
  });
  sheet.getRange(2, c('Прогноз') + 1, out.length, 1).setValues(out.map(function (o) { return [o[0]]; }));
  sheet.getRange(2, c('Ниж. (расчёт)') + 1, out.length, 2).setValues(out.map(function (o) { return [o[1], o[2]]; }));
  return out.length;
}

/** Публикация: «расчёт» → «показ», сообщение для пациента, время публикации. Не работает при «Имитации сбоя». */
function publish_(n) {
  if (isFailureSimulated_()) return false;
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.APPOINTMENTS);
  var rows = readRows_(SHEETS.APPOINTMENTS);
  if (rows.length) {
    var c = apptCol_;
    var shown = rows.map(function (r) { return [r[c('Ниж. (расчёт)')], r[c('Верх. (расчёт)')]]; });
    sheet.getRange(2, c('Ниж. (показ)') + 1, rows.length, 2).setValues(shown);
    var messages = rows.map(function (r, i) {
      var a = apptFromRow_(r);
      a.shownLower = shown[i][0];
      a.shownUpper = shown[i][1];
      return [buildPatientView_(a, n).message];
    });
    sheet.getRange(2, c('Сообщение') + 1, rows.length, 1).setValues(messages);
  }
  PropertiesService.getScriptProperties().setProperty(PROP_PUBLISHED_AT, String(n.getTime()));
  return true;
}

/** Данные устарели? Нет публикации STALE_MIN минут в часы работы (тест 34). */
function isStale_(n) {
  if (!isWorkingTime_(n)) return false;
  var published = Number(PropertiesService.getScriptProperties().getProperty(PROP_PUBLISHED_AT)) || 0;
  var open = atMinutes_(n, minutesOf_(openTime_())).getTime();
  var since = Math.max(published, open);   // до первой публикации дня считаем от открытия
  return n.getTime() - since >= CONFIG.STALE_MIN * 60000;
}

/** Время последней публикации (или null). */
function publishedAt_() {
  var v = Number(PropertiesService.getScriptProperties().getProperty(PROP_PUBLISHED_AT));
  return v ? new Date(v) : null;
}

function isFailureSimulated_() {
  return String(readSetting_('Имитация сбоя')).trim().toLowerCase() === 'да';
}

function setFailureSimulated_(on) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.SETTINGS);
  var names = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
  for (var i = 0; i < names.length; i++) {
    if (names[i][0] === 'Имитация сбоя') sheet.getRange(i + 1, 2).setValue(on ? 'да' : 'нет');
  }
}

/** Часы работы: рабочий день и время между открытием и закрытием. */
function isWorkingTime_(n) {
  if (CONFIG.WORK_DAYS.indexOf(n.getDay()) < 0) return false;
  var m = n.getHours() * 60 + n.getMinutes();
  return m >= minutesOf_(openTime_()) && m < minutesOf_(closeTime_());
}

function openTime_() {
  return settingTime_('Открытие клиники', CONFIG.CLINIC_OPEN);
}

function closeTime_() {
  return settingTime_('Закрытие клиники', CONFIG.CLINIC_CLOSE);
}

function settingTime_(name, fallback) {
  var v = readSetting_(name);
  if (isDate_(v)) return formatTime_(v);
  return String(v || fallback).trim();
}

/** Начало обеда каждого врача в минутах от полуночи: { 'Иванова А. С.': 660, … }. */
function doctorLunches_() {
  var map = {};
  readRows_(SHEETS.DOCTORS).forEach(function (r) {
    if (r[0] && r[3]) map[r[0]] = minutesOf_(r[3] instanceof Date ? formatTime_(r[3]) : r[3]);
  });
  return map;
}

/** Пункт меню «Включить таймер»: пересчёт и публикация сами, раз в минуту. */
function menuInstallTimer() {
  var ui = SpreadsheetApp.getUi();
  var exists = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'onTimer'; });
  if (!exists) ScriptApp.newTrigger('onTimer').timeBased().everyMinutes(1).create();
  ui.alert(exists ? 'Таймер уже включён.' : 'Таймер включён: пересчёт и публикация идут сами в часы работы клиники.');
}
