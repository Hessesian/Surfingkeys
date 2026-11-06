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
  // Motions, mode switches, yank and text objects, observed as selection + status.
  const sel = () => page.evaluate(() => [document.getSelection().type, document.getSelection().toString()]);
  const key = async (k, n = 1) => { for (let i = 0; i < n; i++) await page.keyboard.press(k); await sleep(250); };
  // Find: / highlights and enters visual mode on the first match, n steps to the next.
  await key('/'); await page.keyboard.type('the'); await key('Enter'); await sleep(300);
  log('find', await sel());
  await key('n'); log('n', await sel());
  await key('N'); log('N', await sel());
  await key('Escape'); await key('Escape'); await key('/'); await page.keyboard.type('fox'); await key('Enter'); await sleep(300);
  log('find2', await sel());
  await key('l'); await key('l'); log('ll', await sel());
  await key('w'); log('w', await sel());
  await key('e'); log('e', await sel());
  await key('b'); log('b', await sel());
  await key('o'); await key('l'); log('o-l', await sel());
  await key('i'); await key('w'); log('iw', await sel());
  await key('i'); await key('s'); log('is', await sel());
  await key('V'); log('V', await sel());
  await key('y'); log('yank', await sel());
  await key('Escape'); await key('Escape'); log('esc', await sel());
  await key('/'); await page.keyboard.type('lazy'); await key('Enter'); await sleep(300);
  await key('v'); await key('e'); log('caret-e', await sel());
  await key('v'); await key('l'); log('v-v', await sel());
  await key('Escape'); await key('Escape');
  await key('*'); log('star', await page.evaluate(() => [document.getSelection().type, document.querySelectorAll('.surfingkeys_match_mark').length]));
  log('marks', await page.evaluate(() => document.querySelectorAll('.surfingkeys_match_mark').length));
  await key('Escape'); await key('Escape'); log('find-esc', await page.evaluate(() => [document.querySelectorAll('.surfingkeys_match_mark').length, document.getSelection().type]));
  await page.close();
};
