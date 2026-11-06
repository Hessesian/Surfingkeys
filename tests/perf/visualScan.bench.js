// Times visual-mode text scanning on a large diff-like page in real Chrome and checks
// the indexed scan against the full scan, filtered by the browser's own visibility.
//
//   node tests/perf/visualScan.bench.js [path-to-chrome] [rows]
//
// Without a path, puppeteer's default browser is used.

const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const puppeteer = require("puppeteer");

const chromePath = process.argv[2];
const ROWS = Number(process.argv[3] || 15000);

const source = fs.readFileSync(path.join(__dirname, "../../src/content_scripts/common/elementIndex.ts"), "utf8");
const moduleJs = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText + "\nwindow.__index = { startElementIndexWhenIdle, visibleTextElements };";

// Each planted case names text the scan must or must not find.
const row = (i) => {
    const extra = {
        10000: `<span style="position:fixed;top:300px;left:700px">MUST fixed escapee</span>`,
        9000: `<div style="position:absolute;top:40px;left:900px">MUST absolute escapee</div>`,
        8000: `<div style="transform:translateY(-${8000 * 22}px)">MUST transformed into view</div>`,
    }[i] || "";
    return `<tr><td><a href="#L${i}">${i}</a></td><td><span class="k">const</span> <span class="v">value${i}</span> = <span class="f">compute</span>(<span class="s">"string literal ${i}"</span>, <span class="n">options</span>);${extra}</td></tr>`;
};
const top = `
<div style="display:flex;flex-direction:column-reverse;height:100px;overflow:hidden">${
    Array.from({ length: 200 }, (_, i) => `<div style="height:20px;flex-shrink:0">${i < 5 ? "MUST" : "NOT"} reversed item ${i}</div>`).join("")}</div>
<div style="height:0"><div>MUST overflowing a zero-height parent</div></div>
<div style="width:300px;overflow-x:auto;white-space:nowrap"><span>MUST scroller start</span><span style="margin-left:2000px">NOT scrolled out of view</span></div>
<div style="overflow:hidden;height:30px;position:relative"><div>MUST clip top line</div><div style="margin-top:40px">NOT clipped below</div><div style="position:absolute;top:0;left:400px">MUST absolute inside clip</div></div>
<div style="overflow:hidden;height:30px"><div style="position:absolute;top:60px;left:600px">MUST absolute escaping a static clip</div></div>
<div style="display:none">${Array.from({ length: 5000 }, () => "<span>NOT display none</span>").join("")}</div>
<div style="visibility:hidden">NOT visibility hidden</div>
<div id="host"></div>`;
const html = `<!doctype html><html><body>${top}<table>${Array.from({ length: ROWS }, (_, i) => row(i)).join("")}</table></body></html>`;

(async () => {
    const browser = await puppeteer.launch({ headless: true, ...(chromePath ? { executablePath: chromePath } : {}) });
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    await page.setContent(html);
    await page.evaluate(() => {
        document.getElementById("host").attachShadow({ mode: "open" }).innerHTML = "<span>MUST inside shadow root</span>";
    });
    await page.addScriptTag({ type: "module", content: moduleJs });

    const indexMs = await page.evaluate(() => new Promise((resolve) => {
        const s = performance.now();
        window.__index.startElementIndexWhenIdle(() => "a");
        const poll = () => window.__index.visibleTextElements({ width: innerWidth, height: innerHeight })
            ? resolve(performance.now() - s) : setTimeout(poll, 20);
        poll();
    }));

    const report = await page.evaluate(async () => {
        const hasText = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.data.length > 0);
        const all = (root) => [...root.querySelectorAll("*")].flatMap((e) => e.shadowRoot ? [e, ...all(e.shadowRoot)] : [e]);
        const t0 = performance.now();
        const legacy = all(document).filter((e) => {
            const r = e.getBoundingClientRect();
            return r.top <= innerHeight && r.bottom >= 0 && r.left <= innerWidth && r.right >= 0 && r.height > 0
                && getComputedStyle(e).visibility !== "hidden" && hasText(e);
        });
        const legacyMs = performance.now() - t0;

        const visible = await new Promise((resolve) => {
            const seen = new Set();
            const io = new IntersectionObserver((entries) => {
                for (const en of entries) if (en.isIntersecting && en.intersectionRect.width > 0 && en.intersectionRect.height > 0) seen.add(en.target);
                io.disconnect();
                resolve(seen);
            });
            legacy.forEach((e) => io.observe(e));
        });
        const truth = legacy.filter((e) => visible.has(e));

        const times = [];
        let found;
        for (let i = 0; i < 5; i++) {
            const s = performance.now();
            found = window.__index.visibleTextElements({ width: innerWidth, height: innerHeight });
            times.push(performance.now() - s);
        }
        const label = (e) => e.textContent.trim().slice(0, 40);
        const foundSet = new Set(found);
        const truthSet = new Set(truth);
        const markers = [...document.querySelectorAll("*"), ...document.getElementById("host").shadowRoot.querySelectorAll("*")]
            .filter((e) => hasText(e) && /^(MUST|NOT)/.test(e.firstChild.data || ""));
        return {
            domElements: document.getElementsByTagName("*").length,
            legacyScanMs: legacyMs.toFixed(1),
            indexedScanMs: times.map((x) => x.toFixed(1)).join(", "),
            truth: truth.length,
            found: found.length,
            missedVsTruth: truth.filter((e) => !foundSet.has(e)).map(label),
            extraVsTruth: found.filter((e) => !truthSet.has(e)).map(label),
            markerFailures: markers.filter((e) => e.firstChild.data.startsWith("MUST") !== foundSet.has(e)).map(label),
        };
    });
    console.log(JSON.stringify({ indexReadyMs: indexMs.toFixed(0), ...report }, null, 1));
    await browser.close();
    process.exit(report.missedVsTruth.length || report.markerFailures.length ? 1 : 0);
})();
