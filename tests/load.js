// Загружает все .js из src в одну «песочницу», как это делает Apps Script.
// Сервисы Google заменены простыми заглушками — только то, что нужно для проверок логики.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

function loadSrc() {
  const sandbox = {
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      getUuid: () => crypto.randomUUID(),
      computeDigest: (alg, text) => Array.from(crypto.createHash('sha256').update(text).digest())
        .map((b) => (b > 127 ? b - 256 : b)), // в Apps Script байты со знаком
    },
  };
  vm.createContext(sandbox);
  const dir = path.join(__dirname, '..', 'src');
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort()) {
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), sandbox, { filename: f });
  }
  return sandbox;
}

module.exports = { loadSrc };
