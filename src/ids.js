/**
 * Токены ссылок и номера в очереди.
 */

/** Новый случайный токен: CONFIG.TOKEN_LENGTH символов из CONFIG.TOKEN_ALPHABET. Тест 28. */
function generateToken() {
  // Случайные байты: хеш от двух случайных UUID.
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    Utilities.getUuid() + Utilities.getUuid());
  return tokenFromBytes(bytes, CONFIG.TOKEN_ALPHABET, CONFIG.TOKEN_LENGTH);
}

/** Превращает байты в токен. В алфавите 32 символа, поэтому все символы равновероятны. */
function tokenFromBytes(bytes, alphabet, length) {
  if (bytes.length < length) throw new Error('Мало случайных байтов для токена');
  var out = '';
  for (var i = 0; i < length; i++) {
    out += alphabet.charAt((bytes[i] & 0xff) % alphabet.length);
  }
  return out;
}

/** Похож ли токен на правильный по форме (длина и алфавит). */
function isTokenFormat(token) {
  if (typeof token !== 'string' || token.length !== CONFIG.TOKEN_LENGTH) return false;
  for (var i = 0; i < token.length; i++) {
    if (CONFIG.TOKEN_ALPHABET.indexOf(token.charAt(i)) < 0) return false;
  }
  return true;
}

/**
 * «Похожи» ли два токена (тест 30): общее начало из 3+ символов
 * или 6+ совпадающих символов на тех же местах. У случайных токенов такое почти не бывает.
 */
function tokensLookAlike(a, b) {
  var prefix = 0;
  while (prefix < a.length && a.charAt(prefix) === b.charAt(prefix)) prefix++;
  var same = 0;
  for (var i = 0; i < Math.min(a.length, b.length); i++) {
    if (a.charAt(i) === b.charAt(i)) same++;
  }
  return prefix >= 3 || same >= 6;
}

/**
 * Наименьший свободный номер от 1 до max. used — занятые номера незакрытых приёмов. Тест 42.
 */
function lowestFreeNumber(used, max) {
  var taken = {};
  used.forEach(function (n) { taken[Number(n)] = true; });
  for (var n = 1; n <= max; n++) {
    if (!taken[n]) return n;
  }
  throw new Error('Свободных номеров в очереди нет. Увеличь CONFIG.QUEUE_NUMBER_MAX в config.js.');
}

/** 4 последние цифры телефона. */
function phoneLast4(phone) {
  var digits = String(phone).replace(/\D/g, '');
  return digits.slice(-4);
}
