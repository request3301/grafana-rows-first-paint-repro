// Loads the dashboard in Chromium and checks, on every animation frame, whether row headers are on screen while
// their grids are not rendered yet (the "bare list of row titles" frame).
//
// node repro.mjs [--url=http://localhost:3000/d/rows-first-paint] [--runs=3] [--cpu=4] [--kiosk] [--video=videos]
import { chromium } from 'playwright';

const arg = (name, def) => {
  const a = process.argv.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  return a === undefined ? def : a.includes('=') ? a.split('=').slice(1).join('=') : true;
};
const base = arg('url', `http://localhost:${process.env.GRAFANA_PORT ?? 3000}/d/rows-first-paint`);
const url = arg('kiosk', false) ? `${base}${base.includes('?') ? '&' : '?'}kiosk` : base;
const runs = Number(arg('runs', 3));
const cpu = Number(arg('cpu', 1));
const videoDir = arg('video', false);

const browser = await chromium.launch({ headless: true });
let failed = 0;
for (let run = 1; run <= runs; run++) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    ...(videoDir ? { recordVideo: { dir: videoDir, size: { width: 1600, height: 900 } } } : {}),
  });
  const page = await context.newPage();
  if (cpu > 1) {
    await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: cpu });
  }
  await page.addInitScript(() => {
    const frames = (window.__frames = []);
    const tick = () => {
      const rows = [...document.querySelectorAll('[data-testid^="data-testid dashboard-row-wrapper-for-"]')];
      const headers = rows.filter((r) => r.querySelector('.dashboard-row-header')).length;
      const withGrid = rows.filter((r) => r.querySelector('.react-grid-layout')).length;
      const last = frames[frames.length - 1];
      if (!last || last.headers !== headers || last.withGrid !== withGrid) {
        frames.push({ t: Math.round(performance.now()), headers, withGrid });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.goto(url, { waitUntil: 'commit' });
  await page.waitForFunction(
    () => document.querySelectorAll('.react-grid-layout').length > 0,
    null,
    { timeout: 120_000 }
  );
  await page.waitForTimeout(1000);
  const frames = await page.evaluate(() => window.__frames);
  await context.close();

  // A frame where row headers are painted but none of the rows has its grid yet.
  const bad = frames.findIndex((f) => f.headers > 0 && f.withGrid === 0);
  const done = frames.findIndex((f) => f.headers > 0 && f.withGrid === f.headers);
  if (bad >= 0) {
    failed++;
    const ms = (done >= 0 ? frames[done].t : NaN) - frames[bad].t;
    console.log(`run ${run}: BUG - ${frames[bad].headers} row titles painted without any grid for ${ms} ms (frame ${frames[bad].t} ms -> ${frames[done]?.t} ms)`);
  } else {
    console.log(`run ${run}: OK  - row titles and grids appeared in the same frame (${frames[done]?.t} ms)`);
  }
}
await browser.close();
console.log(failed ? `\nReproduced in ${failed}/${runs} runs (${url}, CPU x${cpu})` : `\nNot reproduced (${url}, CPU x${cpu})`);
process.exitCode = failed ? 1 : 0;
