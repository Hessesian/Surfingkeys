const { openPage, sleep } = require('../lib');

module.exports = async (env, log) => {
  const page = await openPage(env, 'basic.html');
  await page.mouse.click(5, 300);
  const frontendHeight = () => page.evaluate(() => {
    const walk = root => [...root.querySelectorAll('*')].flatMap(e => [e, ...(e.shadowRoot ? walk(e.shadowRoot) : [])]);
    return Math.max(0, ...walk(document).filter(e => e.tagName === 'IFRAME').map(f => Math.round(f.getBoundingClientRect().height)));
  });
  log('before', await frontendHeight());
  await page.keyboard.type('o'); await sleep(800);
  log('after-o', await frontendHeight());
  await page.keyboard.press('Escape'); await sleep(500);
  log('after-esc', await frontendHeight());
  await page.close();
};
