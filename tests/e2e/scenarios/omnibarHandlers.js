const { openPage, sleep } = require('../lib');

// Observes the omnibar from inside the frontend iframe for each handler a key opens: the prompt (text, or the
// alt of an engine's icon) and the rendered result list. Only values that do not vary with the profile are logged.
module.exports = async (env, log) => {
  const page = await openPage(env, 'basic.html');
  await page.mouse.click(5, 300);
  const frame = () => page.frames().find(f => f.url().includes('pages/frontend.html'));
  const snap = (max = 5) => frame().evaluate(max => {
    const p = document.querySelector('#sk_omnibarSearchArea>span.prompt');
    const lis = [...document.querySelectorAll('#sk_omnibarSearchResult>ul>li')];
    return {
      prompt: p.innerText.trim() || (p.querySelector('img') || {}).alt || '',
      input: (document.querySelector('#sk_omnibarSearchArea>input') || {}).value,
      results: lis.length > 0,
      head: lis.slice(0, max).map(li => li.innerText.replace(/\s+/g, ' ').trim()),
      focused: lis.findIndex(li => li.classList.contains('focused')),
      pageInfo: document.querySelector('#sk_omnibarSearchArea>span.resultPage').innerText.replace(/\d+/g, 'N'),
    };
  }, max);
  const open = async keys => { await page.keyboard.type(keys); await sleep(1200); };
  const close = async () => { await page.keyboard.press("Escape"); await sleep(1000); };
  const type = async s => { await page.keyboard.type(s); await sleep(900); };

  // URLs omnibar: a typed URL is always offered as the first item.
  await open('o');
  await type('example.com');
  const urls = await snap(1);
  log('o-url', { prompt: urls.prompt, input: urls.input, head: urls.head });
  await close();

  // alias + Space switches to the engine, Backspace on an empty query switches back.
  await open('o');
  await page.keyboard.type('g'); await page.keyboard.press('Space'); await sleep(900);
  const engine = await snap(0);
  log('o-g-space', { prompt: engine.prompt, input: engine.input });
  await page.keyboard.type('ab'); await sleep(300);
  await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace'); await sleep(300);
  await page.keyboard.press('Backspace'); await sleep(900);
  const back = await snap(0);
  log('o-g-space-backspace', { prompt: back.prompt, input: back.input });
  await close();

  // Space after text that is not an alias must stay literal.
  await open('o');
  await type('zz qq');
  log('o-nonalias', await snap(0).then(s => ({ prompt: s.prompt, input: s.input })));
  await close();

  await open(':');
  const cmds = await snap(3);
  log('commands', { prompt: cmds.prompt, cls: await frame().evaluate(() => document.querySelector('#sk_omnibarSearchResult').className) });
  await type('setl');
  const filt = await snap(2);
  log('commands-filter', { input: filt.input, results: filt.results, head: filt.head.map(h => h.split(' ')[0]) });
  await close();

  await open(';om');
  const marks = await snap();
  log('vimarks', { prompt: marks.prompt, head: marks.head });
  await close();

  await open('b');
  const bm = await snap(0);
  log('bookmarks', { prompt: bm.prompt });
  await type('zzzqqq');
  log('bookmarks-nomatch', await snap(0).then(s => ({ results: s.results })));
  await close();

  // Tabs (gather action) lists the tabs of other windows; there are none here.
  await open(';gt');
  const tabs = await snap(0);
  log('tabs-gather', { prompt: tabs.prompt, results: tabs.results });
  await close();

  // CloseTabs lists the current window's tabs: at least this page.
  await open(';x');
  const ct = await snap(0);
  log('closetabs', { prompt: ct.prompt, results: ct.results, focused: ct.focused });
  await type('basic');
  log('closetabs-filter', await snap(0).then(s => ({ input: s.input, results: s.results })));
  await close();

  for (const [name, keys] of [['history', ';oh'], ['recentlyclosed', ';ox'], ['tabhistory', ';oH']]) {
    await open(keys);
    log(name, await snap(0).then(s => s.prompt));
    await close();
  }

  await open('t');
  log('t-prompt', await snap(0).then(s => s.prompt));
  await close();
  await open('go');
  log('go-prompt', await snap(0).then(s => s.prompt));
  await close();

  await open('ab');
  const add = await snap(0);
  log('addbookmark', { prompt: add.prompt, results: add.results });
  await close();

  await open('Q');
  log('omniquery', await snap(0).then(s => s.prompt));
  await close();

  // Ctrl-j moves the omnibar to the bottom (and re-opens it); Ctrl-j again restores it.
  await open('o');
  await page.keyboard.down('Control'); await page.keyboard.press('KeyJ'); await page.keyboard.up('Control');
  await sleep(1200);
  log('ctrl-j', await frame().evaluate(() => document.querySelector('#sk_omnibar').className));
  await page.keyboard.down('Control'); await page.keyboard.press('KeyJ'); await page.keyboard.up('Control');
  await sleep(1200);
  log('ctrl-j-again', await frame().evaluate(() => document.querySelector('#sk_omnibar').className));
  await close();
  await page.close();
};
