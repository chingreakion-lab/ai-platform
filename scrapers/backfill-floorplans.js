/**
 * 补全现有房源缺少的图面文件
 * 对所有房源尝试下载，不依赖 offer_zumens_count（该字段可能不准确）
 * 逐个索引请求直到收到 404 为止
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const HOUSES_DIR = '/Volumes/NewVolume1/mimap-scraper-out/houses';
const PROFILE_DIR = path.join(__dirname, 'pw-profile');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
    const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: true,
        args: ['--no-sandbox'],
    });
    const page = browser.pages()[0] || await browser.newPage();

    // 确认登录
    await page.goto('https://itandibb.com/rent_rooms/list', { waitUntil: 'networkidle' });
    console.log('✅ 登录状态 URL:', page.url());

    // 收集需要下载图面的房源
    const houseDirs = fs.readdirSync(HOUSES_DIR).filter(d => /^\d+$/.test(d));
    const targets = [];

    for (const id of houseDirs) {
        const detailPath = path.join(HOUSES_DIR, id, 'detail.json');
        if (!fs.existsSync(detailPath)) continue;

        const detail = JSON.parse(fs.readFileSync(detailPath, 'utf-8'));
        if (!detail || typeof detail !== 'object') continue;
        const reportedCount = typeof detail.offer_zumens_count === 'number' ? detail.offer_zumens_count : 0;

        const propertyId = detail.property_id || id;
        const floorplanDir = path.join(HOUSES_DIR, id, 'floorplan');

        // 检查已有多少
        let existing = 0;
        if (fs.existsSync(floorplanDir)) {
            existing = fs.readdirSync(floorplanDir).filter(f => f.match(/^zumen_\d+\.(pdf|png)$/)).length;
        }

        // 对所有房源都加入，不跳过 count=0（count 可能不准确）
        targets.push({ id, propertyId, reportedCount, existing, floorplanDir });
    }

    console.log(`\n📋 处理房源总数: ${targets.length} 个`);
    targets.forEach(t => console.log(`  ${t.id}: reported=${t.reportedCount} already=${t.existing}`));

    let totalDownloaded = 0;
    const MAX_PROBE = 10; // 每个房源最多探测10个图面

    for (const target of targets) {
        console.log(`\n📥 ${target.id} (property_id=${target.propertyId}, reported=${target.reportedCount})`);
        fs.mkdirSync(target.floorplanDir, { recursive: true });
        let gotAny = false;

        for (let i = 0; i < MAX_PROBE; i++) {
            const destPdf = path.join(target.floorplanDir, `zumen_${i}.pdf`);
            const destPng = path.join(target.floorplanDir, `zumen_${i}.png`);
            if (fs.existsSync(destPdf) || fs.existsSync(destPng)) {
                console.log(`  ⏭  图面 ${i}: 已存在，跳过`);
                gotAny = true;
                continue;
            }

            const dlUrl = `https://api.itandibb.com/api/internal/v4/properties/${target.propertyId}/offer_zumens/${i}?request_page=detail_page&is_zumen_download=true`;

            try {
                const result = await page.evaluate(async (url) => {
                    try {
                        const r = await fetch(url, { credentials: 'include' });
                        if (!r.ok) return { error: r.status };
                        const ct = r.headers.get('content-type') || '';
                        const ab = await r.arrayBuffer();
                        return { bytes: Array.from(new Uint8Array(ab)), contentType: ct };
                    } catch (e) { return { error: e.message }; }
                }, dlUrl);

                if (result?.error !== undefined) {
                    if (result.error === 404) {
                        console.log(`  🔚  图面 ${i}: 404 → 已无更多文件`);
                        break; // 终止本房源的循环
                    }
                    console.log(`  ❌  图面 ${i}: HTTP ${result.error}`);
                    break;
                }

                if (result?.bytes?.length > 100) {
                    const ext = result.contentType.includes('pdf') ? 'pdf' : 'png';
                    const dest = path.join(target.floorplanDir, `zumen_${i}.${ext}`);
                    fs.writeFileSync(dest, Buffer.from(result.bytes));
                    const kb = Math.round(result.bytes.length / 1024);
                    console.log(`  ✅  图面 ${i}: ${ext.toUpperCase()} ${kb}KB → ${path.basename(dest)}`);
                    totalDownloaded++;
                    gotAny = true;
                } else {
                    console.log(`  ⚠️  图面 ${i}: 响应为空`);
                    break;
                }
            } catch (e) {
                console.log(`  ❌  图面 ${i}: ${e.message}`);
                break;
            }

            await sleep(300);
        }
        if (!gotAny) console.log(`  ℹ️  该房源无图面`);
    }

    console.log(`\n🎉 完成！共下载 ${totalDownloaded} 个图面文件`);
    await browser.close();
})();
