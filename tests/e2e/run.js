// Usage: node tests/e2e/run.js <extDir>   (env CHROME = Chrome binary)
// Runs every scenario against the built extension and prints `<scenario> <step> <json>` per observation.
const fs = require('fs'), path = require('path');
const { start } = require('./lib');

(async () => {
  const extDir = process.argv[2];
  if (!extDir) throw new Error('usage: node tests/e2e/run.js <extDir>');
  const env = await start(extDir);
  try {
    const dir = path.join(__dirname, 'scenarios');
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()) {
      const name = f.replace(/\.js$/, '');
      await require(path.join(dir, f))(env, (step, value) => console.log(`${name} ${step} ${JSON.stringify(value)}`));
    }
  } finally { await env.close(); }
})().catch(e => { console.error(e); process.exit(1); });
