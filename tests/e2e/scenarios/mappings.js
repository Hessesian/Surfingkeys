const { openPage, sleep } = require('../lib');

// `?` opens the usage popup in the frontend iframe: every normal-mode mapping with its annotation, grouped by
// feature group. It does not list visual/insert/omnibar mappings, so those are covered only by their own scenarios.
module.exports = async (env, log) => {
  const page = await openPage(env, 'scroll.html');
  await page.mouse.click(100, 300); await sleep(200);
  await page.keyboard.type('?'); await sleep(1500);
  const frame = page.frames().find(f => f.url().includes('pages/frontend.html'));
  const lines = await frame.evaluate(() => {
    const u = document.getElementById('sk_usage');
    const out = [];
    const walk = (n) => {
      if (n.nodeType === 3) { const t = n.textContent.trim(); if (t) out.push(t); return; }
      if (n.nodeType !== 1) return;
      if (n.tagName === 'DIV' || n.tagName === 'LI' || n.tagName === 'TR') out.push('\n');
      n.childNodes.forEach(walk);
      if (n.tagName === 'SPAN' || n.tagName === 'DIV') out.push(' ');
    };
    walk(u);
    return out.join('').split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  });
  lines.forEach((l, i) => log(String(i).padStart(4, '0'), l));
  await page.keyboard.press('Escape'); await sleep(300);
  await page.close();
};
