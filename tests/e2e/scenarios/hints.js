const { openPage, sleep } = require('../lib');

module.exports = async (env, log) => {
  const page = await openPage(env, 'hints.html');
  await page.mouse.click(500, 500);
  const labels = () => page.evaluate(() => [...document.querySelectorAll('.surfingkeys_hints_host')]
    .flatMap(h => h.shadowRoot ? [...h.shadowRoot.querySelectorAll('section > div')].map(d => d.textContent) : []));
  await page.keyboard.type('f'); await sleep(600);
  const all = await labels();
  log('f-count', all.length);
  log('f-labels', all);
  // Hint labels come in link order, so the label at index 3 (typed lowercase: Shift would open a new tab) must open #link3.
  if (all[3]) { await page.keyboard.type(all[3].toLowerCase()); await sleep(600); }
  log('after-click', await page.evaluate(() => location.hash));
  log('hints-left', (await labels()).length);
  await page.close();
};
