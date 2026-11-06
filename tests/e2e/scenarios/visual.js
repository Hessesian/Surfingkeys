const { openPage, sleep, chord } = require('../lib');

module.exports = async (env, log) => {
  const page = await openPage(env, 'basic.html');
  await page.mouse.click(5, 300);
  await chord(page, 'Shift', 'KeyV'); await sleep(600);
  log('hint-hosts', await page.evaluate(() => [...document.querySelectorAll('.surfingkeys_hints_host')].map(h => h.shadowRoot ? h.shadowRoot.querySelectorAll('div').length : -1)));
  const labels = await page.evaluate(() => { const h = [...document.querySelectorAll('.surfingkeys_hints_host')].find(h => h.shadowRoot && h.shadowRoot.querySelector('section')); return h ? [...h.shadowRoot.querySelectorAll('section > div')].map(d => d.textContent).slice(0, 3) : null; });
  log('labels', labels);
  if (labels && labels[0]) { await page.keyboard.type(labels[0]); await sleep(400); }
  log('selection', await page.evaluate(() => [document.getSelection().type, document.getSelection().toString()]));
  await page.close();
};
