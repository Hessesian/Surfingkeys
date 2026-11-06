// Shared harness: one browser with the extension loaded, a fixture server, and helpers scenarios use.
const puppeteer = require('puppeteer');
const http = require('http'), fs = require('fs'), path = require('path');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const FIXTURES = path.join(__dirname, 'fixtures');

async function start(extDir) {
  if (!process.env.CHROME) throw new Error('set CHROME to a Chrome/Chromium binary that can load extensions');
  const ext = path.resolve(extDir);
  const srv = http.createServer((q, r) => {
    const f = path.join(FIXTURES, path.basename(q.url.split('?')[0]));
    if (!fs.existsSync(f)) { r.statusCode = 404; return r.end(); }
    r.setHeader('content-type', 'text/html'); r.end(fs.readFileSync(f));
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME, pipe: true, enableExtensions: true,
    args: ['--no-sandbox', '--disable-extensions-except=' + ext, '--load-extension=' + ext] });
  return { browser, base, close: async () => { await browser.close(); srv.close(); } };
}

// A fresh page on `fixture` at the fixed viewport. `ready` is an optional page expression to wait for.
async function openPage(env, fixture, { height = 600, ready } = {}) {
  const page = await env.browser.newPage();
  await page.setViewport({ width: 1000, height });
  await page.goto(env.base + fixture);
  if (ready) await page.waitForFunction(ready, { timeout: 30000 });
  await sleep(1500);
  return page;
}

const chord = async (page, mod, code) => {
  if (mod) await page.keyboard.down(mod);
  await page.keyboard.press(code);
  if (mod) await page.keyboard.up(mod);
};

module.exports = { start, openPage, sleep, chord };
