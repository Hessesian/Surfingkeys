const { openPage, sleep } = require('../lib');

module.exports = async (env, log) => {
  const page = await openPage(env, 'scroll.html');
  await page.mouse.click(100, 300); await sleep(200);
  const pos = () => page.evaluate(() => [Math.round(scrollY), document.getElementById('box').scrollTop]);
  const steps = [['j'], ['3', 'j'], ['d'], ['u'], ['G'], ['g', 'g'], ['5', '0', '%'], ['c', 's'], ['j'], ['c', 'S'], ['d']];
  for (const s of steps) {
    for (const k of s) { await page.keyboard.type(k); await sleep(60); }
    await sleep(700);
    log(s.join(''), await pos());
  }
  await page.close();
};
