/**
 * 不良 detail.json（HTML保存 / all_images空）を持つ物件を再スクレイプ
 * 対象: detail.json が dict でない、または all_images.length === 0 の物件
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const HOUSES_DIR = '/Volumes/NewVolume1/mimap-scraper-out/houses';
const PROFILE_DIR = path.join(__dirname, 'pw-profile');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function downloadFile(url, dest) {
    try {
        const r = await fetch(url);
        if (!r.ok) return false;
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < 100) return false;
        fs.writeFileSync(dest, buf);
        return true;
    } catch (_) { return false; }
}

(async () => {
    // ── 1. 不良物件を収集 ──────────────────────────────────────────
    const bad = [];
    for (const rid of fs.readdirSync(HOUSES_DIR)) {
        if (!/^\d+$/.test(rid)) continue;
        const detailPath = path.join(HOUSES_DIR, rid, 'detail.json');
        if (!fs.existsSync(detailPath)) continue;
        try {
            const d = JSON.parse(fs.readFileSync(detailPath, 'utf-8'));
            if (!d || typeof d !== 'object' || !Array.isArray(d.all_images) || d.all_images.length === 0) {
                bad.push(rid);
            }
        } catch (_) {
            bad.push(rid); // パースエラー（HTMLゴミなど）
        }
    }

    console.log(`\n🔍 再スクレイプ対象: ${bad.length} 件`);
    bad.forEach(id => console.log(`  ${id}`));
    if (bad.length === 0) { console.log('✅ 不良物件なし'); return; }

    // ── 2. ブラウザ起動 ────────────────────────────────────────────
    const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: true,
        args: ['--no-sandbox'],
    });
    const page = browser.pages()[0] || await browser.newPage();

    await page.goto('https://itandibb.com/rent_rooms/list', { waitUntil: 'networkidle' });
    if (!page.url().includes('itandibb.com/rent_rooms')) {
        console.error('❌ ログイン失敗:', page.url());
        await browser.close(); return;
    }
    console.log('✅ ログイン確認:', page.url());

    let fixed = 0, failed = 0;

    for (const roomId of bad) {
        const houseDir = path.join(HOUSES_DIR, roomId);
        const detailPath = path.join(houseDir, 'detail.json');

        console.log(`\n📥 ${roomId}: APIから再取得中...`);

        // ── 3. detail API ──────────────────────────────────────────────
        const detailData = await page.evaluate(async (rid) => {
            for (const base of [
                'https://api.itandibb.com/api/internal/v4',
                'https://itandibb.com/api/internal/v4'
            ]) {
                try {
                    const r = await fetch(`${base}/rent_rooms/${rid}`, {
                        headers: { 'Accept': 'application/json' },
                        credentials: 'include'
                    });
                    if (!r.ok) continue;
                    const data = await r.json();
                    return { ok: true, data };
                } catch (_) { }
            }
            return { ok: false };
        }, roomId);

        if (!detailData?.ok) {
            console.log(`  ❌ API取得失敗`);
            failed++;
            await sleep(500);
            continue;
        }

        const d = detailData.data;

        // データ品質チェック
        if (!d || typeof d !== 'object' || !d.rent_text) {
            console.log(`  ⚠️  不完全レスポンス（rent_textなし）→ スキップ`);
            failed++;
            await sleep(500);
            continue;
        }

        const imgs = Array.isArray(d.all_images) ? d.all_images : [];
        console.log(`  📋 all_images: ${imgs.length}件, offer_zumens_count: ${d.offer_zumens_count}`);

        // ── 4. detail.json を上書き保存 ───────────────────────────────
        fs.mkdirSync(houseDir, { recursive: true });
        fs.writeFileSync(detailPath, JSON.stringify(d, null, 2));
        console.log(`  💾 detail.json 保存完了`);

        // ── 5. 画像ダウンロード → imgs/ + thumb.jpg ───────────────────
        if (imgs.length > 0) {
            const imgsDir = path.join(houseDir, 'imgs');
            fs.mkdirSync(imgsDir, { recursive: true });
            let downloaded = 0;
            for (let i = 0; i < imgs.length; i++) {
                const img = imgs[i];
                if (!img?.url) continue;
                const ext = img.url.replace(/\?.*$/, '').split('.').pop() || 'jpg';
                const label = img.type ? `_${img.type.replace(/[\\/:*?"<>|]/g, '')}` : '';
                const dest = path.join(imgsDir, `${String(i).padStart(3, '0')}${label}.${ext}`);
                if (!fs.existsSync(dest)) {
                    const ok = await downloadFile(img.url, dest);
                    if (ok) downloaded++;
                }
                if (i === 0 && !fs.existsSync(path.join(houseDir, 'thumb.jpg'))) {
                    await downloadFile(img.url, path.join(houseDir, 'thumb.jpg'));
                }
            }
            console.log(`  🖼  画像 ${downloaded}/${imgs.length} ダウンロード完了`);
        } else {
            console.log(`  ℹ️  この物件は画像なし（all_images空）`);
        }

        // ── 6. 図面（floorplan）再ダウンロード ───────────────────────
        const propertyId = d.property_id || roomId;
        const fpDir = path.join(houseDir, 'floorplan');
        const existingFps = fs.existsSync(fpDir)
            ? fs.readdirSync(fpDir).filter(f => /^zumen_\d+\.(pdf|png)$/.test(f))
            : [];

        if (existingFps.length === 0) {
            fs.mkdirSync(fpDir, { recursive: true });
            for (let i = 0; i < 10; i++) {
                const dlUrl = `https://api.itandibb.com/api/internal/v4/properties/${propertyId}/offer_zumens/${i}?request_page=detail_page&is_zumen_download=true`;
                const result = await page.evaluate(async (url) => {
                    try {
                        const r = await fetch(url, { credentials: 'include' });
                        if (!r.ok) return { error: r.status };
                        const ct = r.headers.get('content-type') || '';
                        const ab = await r.arrayBuffer();
                        return { bytes: Array.from(new Uint8Array(ab)), contentType: ct };
                    } catch (e) { return { error: e.message }; }
                }, dlUrl);
                if (result?.error !== undefined) break;
                if (result?.bytes?.length > 100) {
                    const ext = result.contentType.includes('pdf') ? 'pdf' : 'png';
                    const dest = path.join(fpDir, `zumen_${i}.${ext}`);
                    fs.writeFileSync(dest, Buffer.from(result.bytes));
                    console.log(`  📐 図面 ${i}: ${ext.toUpperCase()} ${Math.round(result.bytes.length / 1024)}KB`);
                } else break;
            }
        } else {
            console.log(`  ⏭  図面: ${existingFps.length}件 既存スキップ`);
        }

        fixed++;
        await sleep(600 + Math.random() * 400);
    }

    console.log(`\n🎉 完了: 修復=${fixed}, 失敗=${failed} / 計${bad.length}件`);
    await browser.close();
})();
