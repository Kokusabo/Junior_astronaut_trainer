// Every script must parse: a typo in one file blanks a whole page. Run with: node test/syntax.test.js
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
for (const dir of ['src', 'data']) for (const f of fs.readdirSync(path.join(__dirname, '..', dir))) {
  if (f.endsWith('.js')) new vm.Script(fs.readFileSync(path.join(__dirname, '..', dir, f), 'utf8'), { filename: `${dir}/${f}` });
}
console.log('All scripts parse.');
