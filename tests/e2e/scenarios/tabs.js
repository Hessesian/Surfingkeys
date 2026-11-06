const { openPage, sleep } = require('../lib');

// Background tab handlers, observed from the service worker (chrome.tabs.query): headless pages never
// update document.visibilityState on a background-driven switch, so the page cannot tell us which tab is active.
// Tabs: A B C D (D active; the initial about:blank is closed). Keys go to the page of the active tab; focus after
// a switch needs bringToFront.
module.exports = async (env, log) => {
  const tabs = {};
  for (const n of ['A', 'B', 'C', 'D']) tabs['tab' + n] = await openPage(env, `tab${n}.html`);
  const w = await (await env.browser.waitForTarget(x => x.type() === 'service_worker', { timeout: 10000 })).worker();
  const state = () => w.evaluate(() => chrome.tabs.query({ currentWindow: true }).then(ts =>
    ({ active: (ts.find(t => t.active) || {}).title || null, titles: ts.map(t => t.title) })));
  const pageOf = async title => {
    for (const p of await env.browser.pages()) if (!p.isClosed() && await p.title().catch(() => '') === title) return p;
    return (await env.browser.pages())[0];
  };
  const press = async (keys, chordMod) => {
    const p = await pageOf((await state()).active);
    await p.bringToFront(); await sleep(300);
    await p.mouse.click(500, 300); await sleep(200);
    if (chordMod) { await p.keyboard.down(chordMod); await p.keyboard.press(keys[0]); await p.keyboard.up(chordMod); }
    else for (const k of keys) { await p.keyboard.type(k); await sleep(80); }
    await sleep(1200);
  };
  const step = async (name, keys, mod) => { await press(keys, mod); log(name, (await state()).active); };
  // about:blank has no content script, so keys typed there do nothing: drop it.
  await w.evaluate(() => chrome.tabs.query({ currentWindow: true }).then(ts => chrome.tabs.remove(ts.filter(t => t.url === 'about:blank').map(t => t.id))));
  await sleep(500);
  log('start', (await state()).active);
  await step('g0', ['g', '0']);
  await step('g$', ['g', '$']);
  await step('gT', ['g', 'T']);
  await step('gt', ['g', 't']);
  await step('3g0', ['3', 'g', '0']);
  await step('g$-again', ['g', '$']);
  await step('ctrl6', ['Digit6'], 'Control');
  await press(['x']);
  const s = await state();
  log('x', [s.titles.length, s.titles]);
  await press(['X']);
  const r = await state();
  log('X', [r.titles.length, r.titles.slice().sort()]);
  for (const p of await env.browser.pages()) if (/^tab[A-D]$/.test(await p.title().catch(() => ''))) await p.close().catch(() => {});
};
