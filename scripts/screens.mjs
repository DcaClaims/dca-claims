// Takes screenshots of every screen at desktop and phone size. Used by the GitHub "screens" job.
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.env.BASE_URL ?? 'http://localhost:3000';
const out = process.env.OUT_DIR ?? 'screens';
mkdirSync(out, { recursive: true });

const pages = [
  ['today', '/'],
  ['inbox-review', '/inbox'],
  ['inbox-all', '/inbox?tab=all'],
  ['message-impersonation', '/inbox/m5'],
  ['message-hidden-instructions', '/inbox/m8'],
  ['cases', '/cases'],
  ['case-adler-connection', '/cases/c1001'],
  ['case-katz-hebrew', '/cases/c1002'],
  ['approvals', '/approvals'],
];

const browser = await chromium.launch();
const problems = [];
for (const [label, ctxOpts] of [['desktop', { viewport: { width: 1280, height: 900 } }], ['phone', devices['iPhone 13']]]) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${label}: page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${label}: console: ${m.text()}`); });
  for (const [name, path] of pages) {
    const res = await page.goto(base + path, { waitUntil: 'networkidle' });
    if (!res || res.status() >= 400) problems.push(`${label} ${path}: HTTP ${res?.status()}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (overflow) problems.push(`${label} ${path}: page scrolls sideways`);
    await page.screenshot({ path: `${out}/${label}-${name}.png`, fullPage: true });
  }
  await ctx.close();
}
await browser.close();
if (problems.length) {
  console.log('PROBLEMS:\n' + problems.join('\n'));
} else {
  console.log('No problems found.');
}
