/**
 * 仅跑列表页：条件呼び出し → 两个保存条件各执行一次 → 收集所有「募集中」卡片链接
 * 全程拟人化延迟。需已登录（pw-profile）。
 */
const { chromium } = require('playwright');
const config = require('./config');
const { humanDelay } = require('./human-like');

const LIST_URL = config.listUrl;

(async () => {
  const context = await chromium.launchPersistentContext(config.userDataDir, {
    headless: false,
    channel: 'chrome',
    viewport: { width: 1920, height: 1080 },
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-first-run'],
  });

  const page = context.pages()[0] || await context.newPage();

  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await humanDelay(config);

  const allRecruitingLinks = new Set();

  const conditionLabels = ['外国人可0~25', '外国人可25~'];
  for (let conditionIndex = 0; conditionIndex < 2; conditionIndex++) {
    const label = conditionLabels[conditionIndex];
    console.log(`[条件 ${conditionIndex + 1}/2] 条件呼び出し → 选「${label}」→ 検索`);
    try {
      const callBtn = page.getByText('条件呼び出し').first();
      await callBtn.click();
      await humanDelay(config);

      const opt = page.getByText(label, { exact: false }).first();
      await opt.click();
      await humanDelay(config);

      const searchBtn = page.getByText('検索').first();
      await searchBtn.click();
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      await humanDelay(config);

      const recruitingCards = page.locator('text=募集中').locator('..').locator('..').locator('..');
      const links = await page.locator('a[href*="rent_rooms"]').evaluateAll((as) => as.map((a) => a.href));
      const count = await recruitingCards.count();
      for (let i = 0; i < count; i++) {
        const card = recruitingCards.nth(i);
        const a = card.locator('a[href*="rent_rooms"]').first();
        const href = await a.getAttribute('href').catch(() => null);
        if (href) {
          const full = href.startsWith('http') ? href : new URL(href, LIST_URL).href;
          allRecruitingLinks.add(full);
        }
      }
      if (count === 0) {
        for (const href of links) {
          if (href && href.includes('rent_rooms')) allRecruitingLinks.add(href);
        }
      }
      console.log(`[条件 ${conditionIndex + 1}] 本条件 募集中 约 ${count} 条，累计不重复 ${allRecruitingLinks.size}`);
    } catch (e) {
      console.error(`[条件 ${conditionIndex + 1}] 出错:`, e.message);
    }
  }

  console.log('[完成] 募集中 链接数:', allRecruitingLinks.size);
  const fs = require('fs');
  const path = require('path');
  const outDir = config.outDir;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'recruiting-urls.json'), JSON.stringify([...allRecruitingLinks], null, 2));
  await context.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
