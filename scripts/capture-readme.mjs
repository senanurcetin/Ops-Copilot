import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const dir = 'docs/assets';
const base = 'http://localhost:9002';
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
  try {
    await page.getByText('Ops-Copilot', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  } catch (error) {
    console.error('Ops UI failure: status/body:', await page.locator('body').innerText().catch(() => 'NO BODY'));
    console.error('Current URL:', page.url());
    throw error;
  }
  await page.getByRole('img', { name: 'NEXUS' }).waitFor({ state: 'visible' });
  await page.screenshot({ path: dir + '/nexus-login-desktop.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: dir + '/nexus-login-mobile.png', animations: 'disabled' });

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(base + '/case-study', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: /Ops-Copilot now doubles as/i }).waitFor({ state: 'visible', timeout: 45000 });
  await page.getByRole('img', { name: 'NEXUS' }).waitFor({ state: 'visible' });
  await page.screenshot({ path: dir + '/nexus-secom-case-study-desktop.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: dir + '/nexus-secom-case-study-mobile.png', animations: 'disabled' });
  await page.close();
} finally { await browser.close(); }

let readme = await readFile('README.md', 'utf8');
const oldLogin = '![Ops-Copilot interface](https://github.com/user-attachments/assets/63e76a52-267f-4f3e-abd9-5d6bf35e6cf3)';
const replacementLogin = [
  '![NEXUS Ops-Copilot public sign-in screen (real local Chromium, 1440 × 960)](docs/assets/nexus-login-desktop.png)',
  '',
  '<sub>Actual local browser capture of the **public sign-in** page, not an authenticated operator session. Dashboard access remains protected by Firebase.</sub>',
  '',
  '<details><summary>Mobile public sign-in · 390 × 844</summary>',
  '',
  '<img src="docs/assets/nexus-login-mobile.png" alt="NEXUS Ops-Copilot public login on a mobile Chromium viewport" width="390">',
  '',
  '</details>',
].join('\n');
if (readme.includes(oldLogin)) readme = readme.replace(oldLogin, replacementLogin);
else if (!readme.includes('nexus-login-desktop.png')) throw new Error('README login image anchor has changed');
const oldCase = '![Ops-Copilot case study surface](docs/assets/ops-copilot-case-study.png)';
const newCase = [
  '![NEXUS Ops-Copilot SECOM public case study (real local Chromium, 1440 × 960)](docs/assets/nexus-secom-case-study-desktop.png)',
  '',
  '<details><summary>Mobile SECOM case study · 390 × 844</summary>',
  '',
  '<img src="docs/assets/nexus-secom-case-study-mobile.png" alt="NEXUS Ops-Copilot SECOM case-study landing section on mobile Chromium" width="390">',
  '',
  '</details>',
].join('\n');
if (readme.includes(oldCase)) readme = readme.replace(oldCase, newCase);
else if (!readme.includes('nexus-secom-case-study-desktop.png')) throw new Error('README case-study image anchor has changed');
readme = readme.replace('Short video demo:', 'Earlier, pre-NEXUS case-study walkthrough (archival):');
await writeFile('README.md', readme);
console.log('Captured public login and case-study at desktop/mobile sizes. No operator session simulated.');