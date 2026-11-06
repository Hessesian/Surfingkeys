const { openPage, sleep, chord } = require('../lib');
const cases = require('../editorCases');

// Ctrl-i opens the vim editor on the focused field; `:wq` writes it back. Esc in the editor's normal
// mode would close it unsaved, so the text is typed then left with Esc only to reach normal mode for `:wq`.
module.exports = async (env, log) => {
  const page = await openPage(env, 'editors.html', { height: 800, ready: 'window.ready && window.lxReset' });
  for (const [name, c] of Object.entries(cases)) {
    await page.evaluate(c.reset); await sleep(200);
    await page.click(c.sel); await sleep(300);
    await chord(page, 'Control', 'KeyI'); await sleep(1500);
    await page.keyboard.type('Goline two'); await sleep(100);
    await page.keyboard.press('Escape'); await sleep(100);
    await page.keyboard.type(':wq'); await page.keyboard.press('Enter'); await sleep(1200);
    log(name, [await page.evaluate(c.text), await page.evaluate(s => document.querySelector(s).innerHTML, c.sel)]);
    await page.keyboard.press('Escape'); await sleep(300);
  }
  await page.close();
};
