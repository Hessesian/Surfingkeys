const { openPage, sleep, chord } = require('../lib');
const cases = require('../editorCases');

const SEQS = [[['Control','KeyU']], [['Alt','KeyW']], [['Alt','KeyB'],[null,'KeyX']], [['Control','KeyA'],[null,'KeyX']],
  [['Control','KeyA'],['Alt','KeyF'],[null,'KeyX']], [['Control','KeyA'],['Alt','KeyD']], [['Control','KeyA'],['Control','KeyE'],[null,'KeyX']]];

module.exports = async (env, log) => {
  // Ctrl-u in a contenteditable whose text is split across spans.
  let page = await openPage(env, 'basic.html');
  const edText = () => page.evaluate(() => document.getElementById('ed').innerText);
  await page.evaluate(() => { const ed = document.getElementById('ed'); ed.focus(); document.getSelection().setPosition(ed.querySelectorAll('span')[1].firstChild, 0); });
  await sleep(300);
  await chord(page, 'Control', 'KeyU'); await sleep(300);
  log('span-start Ctrl-u', await edText());
  await page.evaluate(() => { const ed = document.getElementById('ed'); ed.innerHTML = '<p><span>hello </span><b>bold</b><span> world</span></p>'; ed.focus(); document.getSelection().setPosition(ed.querySelectorAll('span')[1].firstChild, 3); });
  await chord(page, 'Control', 'KeyU'); await sleep(300);
  log('span-mid Ctrl-u', await edText());
  await page.close();

  page = await openPage(env, 'editors.html', { ready: 'window.ready && window.lxReset' });
  for (const [name, c] of Object.entries(cases)) {
    for (const seq of SEQS) {
      const label = seq.map(([m, k]) => (m ? m[0] + '-' : '') + k.slice(3)).join(' ');
      await page.evaluate(c.reset); await sleep(200);
      await page.click(c.sel); await sleep(200);
      await page.keyboard.press('End'); await sleep(200);
      for (const [m, k] of seq) { if (m) { await chord(page, m, k); await sleep(400); } else { await page.keyboard.press(k); await sleep(200); } }
      await sleep(300);
      log(`${name} ${label}`, await page.evaluate(c.text));
      await page.keyboard.press('Escape'); await sleep(200);
    }
  }
  await page.close();
};
