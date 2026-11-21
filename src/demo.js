/**
 * ДЕМО-ДАННЫЕ: выдуманные врачи, пациенты и записи. Настоящих данных здесь нет.
 */

/** Пункт меню: спрашивает подтверждение и создаёт демо-день. */
function menuCreateDemoDay() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.alert('Создать демо-день',
    'Листы «Записи», «Приёмы» и «Журнал SMS» будут очищены и заполнены заново. Продолжить?',
    ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) return;
  try {
    ui.alert(createDemoDay_());
  } catch (e) {
    ui.alert(e.message);
  }
}

/**
 * Очищает записи, приёмы и журнал SMS и создаёт:
 *  - врачей из DEMO_DOCTORS;
 *  - записи на сегодня (по демо-времени): все окна по 30 минут с 8.00 до 17.00, кроме обеда,
 *    примерно каждое десятое окно свободно;
 *  - по несколько записей через 1, 2, 3, 4 дня (без воскресений).
 * Потом сервис очереди создаёт приёмы с номерами.
 */
function createDemoDay_() {
  setupSheets();
  var today = startOfDay_(now_());
  if (CONFIG.WORK_DAYS.indexOf(today.getDay()) < 0) {
    throw new Error('Сегодня по демо-времени выходной — клиника закрыта. ' +
      'Впиши в «Демо-время» рабочий день (пн–сб) и запусти снова.');
  }

  var ss = SpreadsheetApp.getActive();
  [SHEETS.BOOKINGS, SHEETS.APPOINTMENTS, SHEETS.SMS_LOG, SHEETS.DOCTORS].forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  });
  ss.getSheetByName(SHEETS.DOCTORS).getRange(2, 1, DEMO_DOCTORS.length, 4).setValues(DEMO_DOCTORS);

  var bookings = [];
  var patientNo = 0;
  function addBooking(doctor, apptDate, createdAt) {
    patientNo++;
    bookings.push([
      generateToken_(),
      'P' + String(10000 + patientNo),
      demoName_(patientNo),
      doctor[0], doctor[1],
      createdAt,
      apptDate,
      demoPhone_(),
    ]);
  }

  // Сегодня: все окна каждого врача, кроме обеда.
  var open = minutesOf_(CONFIG.CLINIC_OPEN);
  var close = minutesOf_(CONFIG.CLINIC_CLOSE);
  var createdDaysBefore = [7, 3, 2, 1, 0]; // разные сроки записи — пригодятся для SMS (этап 7)
  DEMO_DOCTORS.forEach(function (doctor) {
    var lunch = minutesOf_(doctor[3]);
    for (var m = open; m + CONFIG.SLOT_MIN <= close; m += CONFIG.SLOT_MIN) {
      if (m >= lunch && m < lunch + CONFIG.LUNCH_MIN) continue; // обед
      if (Math.random() < CONFIG.DEMO_EMPTY_SLOT_SHARE) continue; // свободное окно
      var k = createdDaysBefore[(patientNo) % createdDaysBefore.length];
      addBooking(doctor, atMinutes_(today, m), createdAt_(today, k));
    }
  });

  // Через 1–4 дня: несколько записей, созданных сегодня.
  for (var d = 1; d <= CONFIG.DEMO_DAYS_AHEAD; d++) {
    var day = addDays_(today, d);
    if (CONFIG.WORK_DAYS.indexOf(day.getDay()) < 0) continue;
    for (var j = 0; j < CONFIG.DEMO_FUTURE_PER_DAY; j++) {
      var doctor = DEMO_DOCTORS[(d + j) % DEMO_DOCTORS.length];
      addBooking(doctor, atMinutes_(day, open + CONFIG.SLOT_MIN * (2 + 3 * j)), createdAt_(today, 0));
    }
  }

  var sheet = ss.getSheetByName(SHEETS.BOOKINGS);
  sheet.getRange(2, 1, bookings.length, bookings[0].length).setValues(bookings);
  var created = syncFromBookings_();
  return 'Готово: врачей ' + DEMO_DOCTORS.length + ', записей ' + bookings.length +
    ', приёмов ' + created + '. Сегодня по демо-времени: ' + formatDateTime_(now_()).slice(0, 10) + '.';
}

/**
 * Пункт меню «Демо: задержка 20 минут у врача»: для врача из выделенной строки «Приёмов»
 * все сегодняшние приёмы, которые по демо-времени уже должны были пройти, отмечает «состоялся»
 * с опозданием на 20 минут, а текущий — «идёт». Потом сразу пересчёт и публикация.
 * Так виден интервал без ручного ввода времени (отметки врача появятся на этапе 6).
 */
function menuDemoDelay() {
  var ui = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSheet();
  var row = sheet.getActiveCell().getRow();
  if (sheet.getName() !== SHEETS.APPOINTMENTS || row < 2) {
    ui.alert('Открой лист «Приёмы» и встань на строку любого приёма нужного врача.');
    return;
  }
  var doctor = sheet.getRange(row, apptCol_('Врач') + 1).getValue();
  ui.alert(demoDelay_(doctor, CONFIG.DEMO_DELAY_MIN));
}

function demoDelay_(doctor, delayMin) {
  var n = now_();
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.APPOINTMENTS);
  var rows = readRows_(SHEETS.APPOINTMENTS);
  var c = apptCol_;
  var mine = [];
  rows.forEach(function (r, i) {
    var at = r[c('Дата и время приёма')];
    var status = normalizeStatus_(r[c('Статус')]);
    if (r[c('Врач')] !== doctor || !isDate_(at) || daysBetween_(n, at) !== 0) return;
    if (status === STATUS.CANCELLED || status === STATUS.NO_SHOW) return;
    mine.push({ i: i, at: at, dur: Number(r[c('Длительность, мин')]) || durationMin_() });
  });
  mine.sort(function (a, b) { return a.at - b.at; });
  var done = 0, going = '';
  mine.forEach(function (a) {
    var start = addMin_(a.at, delayMin);
    var end = addMin_(start, a.dur);
    var r = a.i + 2;
    if (end <= n) {
      sheet.getRange(r, c('Начало') + 1, 1, 2).setValues([[start, end]]);
      sheet.getRange(r, c('Статус') + 1).setValue(STATUS.DONE);
      done++;
    } else if (start <= n && !going) {
      sheet.getRange(r, c('Начало') + 1, 1, 2).setValues([[start, '']]);
      sheet.getRange(r, c('Статус') + 1).setValue(STATUS.IN_PROGRESS);
      going = formatTime_(a.at);
    }
  });
  recalc_(n);
  publish_(n);
  return 'Врач ' + doctor + ': «состоялся» с опозданием ' + delayMin + ' мин — ' + done + ' приём(ов)' +
    (going ? ', «идёт» — приём на ' + going : '') + '. Прогноз пересчитан и опубликован (' + formatTime_(n) + ').';
}

// ---------- внутреннее ----------

function demoName_(i) {
  var female = i % 2 === 0;
  var names = female ? DEMO_FEMALE_NAMES : DEMO_MALE_NAMES;
  var first = names[Math.floor(Math.random() * names.length)];
  var last = DEMO_LAST_NAMES[Math.floor(Math.random() * DEMO_LAST_NAMES.length)];
  return first + ' ' + last + (female ? 'а' : '');
}

/** Заведомо ненастоящий телефон: кода страны «0» не существует. */
function demoPhone_() {
  var n = String(Math.floor(Math.random() * 1e7));
  while (n.length < 7) n = '0' + n;
  return '+0 555 ' + n.slice(0, 3) + '-' + n.slice(3);
}

/** Когда создана запись: k дней назад в 9:00; сегодняшняя — в 7:30, до открытия клиники. */
function createdAt_(today, k) {
  return k === 0 ? atMinutes_(today, 7 * 60 + 30) : atMinutes_(addDays_(today, -k), 9 * 60);
}

function minutesOf_(hhmm) {
  var p = String(hhmm).split(':');
  return Number(p[0]) * 60 + Number(p[1]);
}

function startOfDay_(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays_(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function atMinutes_(day, minutes) {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
}
