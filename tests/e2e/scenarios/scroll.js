const { openPage, sleep } = require('../lib');

// A count above repeatThreshold (9) asks "Do you really want to repeat this action N times?"; its Ok
// hint is the first label, `a`. Without answering it every later key goes to the dialog. (Confirmed
// `50%` currently lands at the page bottom, not the middle: the logged value pins that behavior.)
// After `G` the page is at the bottom, so `k`, not `j`, shows that `cS` moved the target back to the page.
const steps = [['j'], ['3', 'j'], ['d'], ['u'], ['G'], ['g', 'g'], ['5', '0', '%', 'a'], ['c', 's'], ['j'], ['c', 'S'], ['k'], ['u']];

module.exports = async (env, log) => {
  const page = await openPage(env, 'scroll.html');
  await page.mouse.click(100, 300); await sleep(200);
  const pos = () => page.evaluate(() => [Math.round(scrollY), document.getElementById('box').scrollTop]);
  for (const s of steps) {
    for (const k of s) { await page.keyboard.type(k); await sleep(60); }
    await sleep(700);
    log(s.join(''), await pos());
  }
  await page.close();
};
