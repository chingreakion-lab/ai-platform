/**
 * 单户详情页采集。存储路径：项目根/scraper-out/houses/<户ID>/
 * 文件名：図面+6位编号.pdf、写真+6位编号_序.jpg、テキスト+6位编号.txt、html+6位编号.html、快照+6位编号.png、meta.json
 * objectNumber 为本次运行中该物件的有序 6 位编号（000001, 000002, …），由 run.js 传入。
 */
const path = require('path');
const fs = require('fs');
const { humanDelay, randomMouseMove, randomScroll } = require('./human-like');

/** 【准则 v1.0】带随机扰动的指数退避重试 */
async function fetchWithBackoff(fn, maxRetries = 3) {
  for (let r = 0; r < maxRetries; r++) {
    try {
      return await fn();
    } catch (e) {
      if (r === maxRetries - 1) throw e;
      const base = Math.pow(2, r) * 500;
      const jitter = Math.floor(Math.random() * 300);
      await new Promise((res) => setTimeout(res, base + jitter));
    }
  }
}

function houseIdFromUrl(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/[^/]+$/);
    return (m ? m[0] : u.pathname).replace(/[^a-zA-Z0-9_-]/g, '_') || 'house_' + Math.random().toString(36).slice(2, 10);
  } catch (_) {
    return 'house_' + Math.random().toString(36).slice(2, 10);
  }
}

async function scrapeDetail(page, url, houseDir, config, objectNumber) {
  const start = Date.now();
  const num = objectNumber || '000000';
  fs.mkdirSync(houseDir, { recursive: true });
  fs.mkdirSync(path.join(houseDir, 'images'), { recursive: true });

  await humanDelay({ minDelayMs: 400, maxDelayMs: 1000 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await humanDelay({ minDelayMs: 300, maxDelayMs: 800 });

  if (page.url().includes('itandi-accounts.com/login')) {
    throw new Error('详情页跳转到登录页，登录态可能已失效');
  }

  await randomMouseMove(page, config);
  await randomScroll(page, config);
  await humanDelay({ minDelayMs: 250, maxDelayMs: 600 });

  const html = await page.content();
  fs.writeFileSync(path.join(houseDir, `html${num}.html`), html, 'utf-8');

  await page.screenshot({ path: path.join(houseDir, `快照${num}.png`), fullPage: true }).catch(() => {});

  // 文本与图片：全选后取选区文本与 HTML 中的图片 URL。广告图在收集 URL 时即按特征排除，只下载非广告图（不会先下载再删）
  const skipImageUrlPatterns = ['IKCAdBannerSquare', '19cfdacc-61a0-4855-b402-f599b4774565', 'Cszol2fJ'];

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
  await humanDelay({ minDelayMs: 120, maxDelayMs: 250 });

  const { selectedText, selectedImgUrls } = await page.evaluate((skipPatterns) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      return { selectedText: (document.body && document.body.innerText) || '', selectedImgUrls: [] };
    }
    const range = sel.getRangeAt(0);
    const text = sel.toString();
    const div = document.createElement('div');
    div.appendChild(range.cloneContents());
    const html = div.innerHTML;
    const imgUrls = [];
    const re = /<img[^>]+src\s*=\s*["']([^"']+)["']/gi;
    let m;
    while ((m = re.exec(html)) !== null) imgUrls.push(m[1]);
    const filtered = imgUrls.filter((src) => !skipPatterns.some((p) => src.includes(p)));
    return { selectedText: text || (document.body && document.body.innerText) || '', selectedImgUrls: filtered };
  }, skipImageUrlPatterns);

  fs.writeFileSync(path.join(houseDir, `テキスト${num}.txt`), selectedText, 'utf-8');

  /** 从全文里识别住址。支持格式：所在地 → 〒xxx → 大阪府…；或 〒 行下一行为完整地址 */
  function extractAddressFromText(text) {
    if (!text || typeof text !== 'string') return '';
    const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const isAddressLine = (s) => s && /都|道|府|県|市|区|町|村|丁目/.test(s) && s.length >= 8;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 1) 先匹配「所在地」标题，下一行 〒、再下一行是完整地址（你给的格式）
      if (/^所在地\s*$/.test(line) || line === '所在地') {
        const next = lines[i + 1];
        const after = lines[i + 2];
        if (next && /〒\s*\d{3}\s*[-－]?\s*\d{4}/.test(next) && after && isAddressLine(after))
          return (next.trim() + ' ' + after.trim()).trim();
        if (next && isAddressLine(next)) return next.trim();
        if (next && /〒/.test(next) && after) return (next.trim() + ' ' + after.trim()).trim();
      }
      // 2) 当前行是 〒 开头
      if (/〒\s*\d{3}\s*[-－]?\s*\d{4}/.test(line)) {
        const onlyPostal = /^〒\s*\d{3}\s*[-－]?\s*\d{4}\s*$/.test(line.replace(/^所在地\s*/, '').trim());
        if (onlyPostal && lines[i + 1] && isAddressLine(lines[i + 1]))
          return (line.replace(/^所在地\s*/, '').trim() + ' ' + lines[i + 1].trim()).trim();
        let addr = line.replace(/^(郵便番号|邮编)\s*[：:\s]*/i, '').replace(/^所在地\s*/, '').trim();
        if (addr.length < 15 && lines[i + 1]) addr = addr + ' ' + lines[i + 1].trim();
        if (addr) return addr;
      }
      if (/^(郵便番号|邮编)\s*[：:]\s*\d/.test(line)) {
        let addr = line.replace(/^(郵便番号|邮编)\s*[：:]\s*/, '').trim();
        if (addr.length < 15 && lines[i + 1]) addr = addr + ' ' + lines[i + 1].trim();
        return addr;
      }
    }
    return '';
  }

  let photoIndex = 0;
  for (let i = 0; i < selectedImgUrls.length; i++) {
    const src = selectedImgUrls[i];
    try {
      const res = await fetchWithBackoff(() => page.request.get(src, { timeout: 15000 }));
      const buf = await res.body();
      const ext = path.extname(new URL(src).pathname) || '.jpg';
      photoIndex++;
      fs.writeFileSync(path.join(houseDir, 'images', `写真${num}_${String(photoIndex).padStart(2, '0')}${ext}`), buf);
    } catch (_) {}
    await humanDelay({ minDelayMs: 150, maxDelayMs: 400 });
  }

  const meta = await page.evaluate(() => {
    const t = (sel) => (document.querySelector(sel) || {}).textContent || '';
    const trim = (s) => (s && String(s).trim()) || '';
    function valueNextToLabel(labelText) {
      const candidates = document.querySelectorAll('th, td, dt, dd, span, div[class], li');
      for (const el of candidates) {
        const text = trim(el.textContent);
        if (text !== labelText && text.replace(/\s/g, '') !== labelText.replace(/\s/g, '')) continue;
        const next = el.nextElementSibling;
        if (next) return trim(next.textContent);
        const parent = el.parentElement;
        if (parent) {
          const sibs = parent.children;
          for (let i = 0; i < sibs.length; i++) if (sibs[i] === el && i + 1 < sibs.length) return trim(sibs[i + 1].textContent);
        }
      }
      return '';
    }
    function fromTableRow(label) {
      const rows = document.querySelectorAll('tr');
      for (const tr of rows) {
        const cells = tr.querySelectorAll('th, td');
        for (let i = 0; i < cells.length; i++) {
          const t = trim(cells[i].textContent);
          if (t === label || t.replace(/\s/g, '') === label.replace(/\s/g, '')) {
            if (i + 1 < cells.length) return trim(cells[i + 1].textContent);
          }
        }
      }
      return '';
    }
    return {
      url: window.location.href,
      物件名: trim(t('h1') || t('[class*="property-name"]') || t('title')),
      賃料: trim(t('[class*="rent"]') || valueNextToLabel('賃料')),
      住所: trim(t('[class*="address"]') || t('[class*="所在地"]') || valueNextToLabel('住所') || valueNextToLabel('所在地') || fromTableRow('住所') || fromTableRow('所在地')),
      専有面積: trim(t('[class*="area"]') || valueNextToLabel('専有面積')),
      部屋番号: trim(t('[class*="room"]') || valueNextToLabel('部屋番号')),
      更新日: trim(t('[class*="update"]') || valueNextToLabel('更新日')),
      scrapedAt: new Date().toISOString(),
    };
  });
  meta.物件编号 = num;
  meta.houseId = houseIdFromUrl(url);
  if (!meta.住所 || !String(meta.住所).trim()) {
    const fromText = extractAddressFromText(selectedText);
    if (fromText) meta.住所 = fromText;
  }
  fs.writeFileSync(path.join(houseDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');

  // 詳細页内：点「図面」→ 下拉中点「管理帯でダウンロード」下载図面，存为 図面+6位.pdf
  try {
    const zumenBtn = page.getByText('図面').first();
    await zumenBtn.waitFor({ state: 'visible', timeout: 15000 });
    await zumenBtn.click({ force: true });
    await humanDelay({ minDelayMs: 350, maxDelayMs: 800 });
    const downloadOpt = page.getByText('管理帯でダウンロード').first();
    await downloadOpt.waitFor({ state: 'visible', timeout: 10000 });
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      downloadOpt.click({ force: true }),
    ]);
    const ext = path.extname((await download.suggestedFilename()) || '.pdf') || '.pdf';
    await download.saveAs(path.join(houseDir, `図面${num}${ext}`));
    await humanDelay({ minDelayMs: 200, maxDelayMs: 500 });
  } catch (e) {
    try { require('fs').appendFileSync(require('path').join(houseDir, '_zumen_fail.txt'), (e.message || String(e)) + '\n', 'utf-8'); } catch (_) {}
  }

  const pdfLinks = await page.locator('a[href*=".pdf"]').evaluateAll((els) => els.map((e) => e.href).filter(Boolean));
  for (let i = 0; i < pdfLinks.length; i++) {
    try {
      const res = await page.request.get(pdfLinks[i], { timeout: 15000 });
      const buf = await res.body();
      const name = path.basename(new URL(pdfLinks[i]).pathname) || `doc_${i}.pdf`;
      fs.writeFileSync(path.join(houseDir, name), buf);
    } catch (_) {}
    await humanDelay({ minDelayMs: 200, maxDelayMs: 500 });
  }

  return { ok: true, houseDir, meta, durationMs: Date.now() - start };
}

module.exports = { scrapeDetail, houseIdFromUrl };
