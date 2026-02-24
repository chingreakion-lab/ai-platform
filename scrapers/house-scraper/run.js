/**
 * 全流程：条件1 → 详情（每户募集中）→ 条件2 → 详情（每户募集中）→ 去重 → 标签 → list_all.csv / today_new.csv / 日志
 * 顺序不可颠倒：先条件1、抓完该条件下所有详情，再条件2、再抓完该条件详情。
 * 约定：页面上的按钮/链接一律用文字定位（getByText），不依赖 button/a 等标签。
 * 摸索网站时不是每个功能都能很快出现：用 config.elementWaitMs 长等待 + elementRetries 重试，超时后重试再进而不是直接退出。
 * 后续如果遇到没有 DOM 文字的控件，再考虑用视觉。
 * 运行策略：收一页就采一页；列表页同质化操作用较短延迟（listDelay 约 0.4–1.1s）；搜索后先收本页链接再滚动，避免漏采顶部募集中。
 * 注：未做「记坐标」复用（仍用 getByText 定位），仅通过缩短 listDelay 加快同质化步骤。
 * 对齐 docs/B-房源与数据策略-执行版.md（仅 Itandi BB）
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const config = require('./config');
const { humanDelay, listDelay: listDelayFn, getRandomUserAgent, randomMouseMove, clickWithOffset } = require('./human-like');
const { scrapeDetail, houseIdFromUrl } = require('./detail-scraper');
const { tryAutoLogin } = require('./auto-login');

const root = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(root, '.env') });
require('dotenv').config({ path: path.join(root, 'agent', '.env') });

/** 【准则 v1.0】启动时宣告全文，确保逻辑权重向本准则倾斜 */
const GUIDELINE_V1 = `
###########################################################
#                AI 极致开发正向执行准则 v1.0              #
###########################################################
【1】硬件压榨与极致性能：ANE/MPS、异步 I/O、内存运算减磁盘 I/O
【2】熟练操作员拟人化：确认延迟 300-550ms，手热效应，按键 120-250ms，非预期 UI 时 ≥2s 识别延迟
【3】动态轨迹与防追踪：唯一贝塞尔、±2px 抖动、预判式点击、10% 超调修正
【4】代码进化与自省：重构后审计报告、指数退避重试、点击动态随机偏移
【5】隐身生存优先级：不可被监测性最顶层
###########################################################
`;
if (!process.env.SKIP_GUIDELINE_PRINT) console.log(GUIDELINE_V1);

const LIST_URL = config.listUrl;
const conditionLabels = ['外国人可0~25', '外国人可25~'];

function logEntry(level, msg, data = {}) {
  return { ts: new Date().toISOString(), level, msg, ...data };
}

/** 断点进度：记录条件索引、页码、上一户网站 id、上一户编号，重连时从该页、该户下一户继续 */
const PROGRESS_FILE = 'progress.json';
const PAUSE_FILE = 'PAUSE';
/** 接续时在本页找不到断点户时，前后各搜几页（共 1+2*N 页），仍找不到则视为可能下架/列表变化，从本页首条继续 */
const RESUME_SEARCH_PAGE_RANGE = 2;
/** 实时进度文件，供置顶小窗口轮询展示 */
const LIVE_PROGRESS_FILE = 'live-progress.json';
/** 累计运行时长（秒），跨次持久化，供小窗「累计耗时」展示 */
const TOTAL_RUNTIME_FILE = 'total_runtime_seconds.json';
/** 无头模式下浏览器截屏文件名，供小窗预览（小图+JPEG 低质量，减少 I/O 不影响采集速度） */
const BROWSER_PREVIEW_FILE = 'browser-preview.jpg';
const BROWSER_PREVIEW_QUALITY = 45;
const BROWSER_PREVIEW_CLIP = { x: 480, y: 270, width: 960, height: 540 }; // 视口中心半幅，能看清动作即可
/** 小窗「一键切换 显示/后台」触发的信号文件；无论有窗/无头都写同一文件，由本脚本轮询处理 */
const REQUEST_TOGGLE_DISPLAY = 'REQUEST_TOGGLE_DISPLAY';
const DISPLAY_STATE_FILE = 'DISPLAY_STATE';

let _runStartTime = 0;
let _previousTotalSec = 0;
let _housesDirForProgress = '';
let _totalInRepoAtStart = 0;

function countHousesInRepo(housesDir) {
  if (!housesDir || !fs.existsSync(housesDir)) return 0;
  const dirs = fs.readdirSync(housesDir);
  let n = 0;
  for (const name of dirs) {
    if (fs.statSync(path.join(housesDir, name)).isDirectory()) n++;
  }
  return n;
}

function writeLiveProgress(outDir, data) {
  try {
    const now = Date.now();
    const elapsedSec = _runStartTime ? (now - _runStartTime) / 1000 : 0;
    const totalInRepo = _housesDirForProgress ? countHousesInRepo(_housesDirForProgress) : (data.totalCollected ?? 0);
    const newThisRun = totalInRepo - _totalInRepoAtStart; // 本次新采（总库增量），避免用 allMeta.length 含重复
    const totalCumulativeSec = _previousTotalSec + elapsedSec;
    const payload = {
      ...data,
      ts: data.ts || new Date().toISOString(),
      runStartTime: _runStartTime || null,
      elapsedSec: Math.round(elapsedSec * 10) / 10,
      totalInRepo,
      newThisRun: Math.max(0, newThisRun),
      totalCumulativeSec: Math.round(totalCumulativeSec * 10) / 10,
    };
    fs.writeFileSync(path.join(outDir, LIVE_PROGRESS_FILE), JSON.stringify(payload), 'utf-8');
  } catch (_) {}
}

/** 心跳：每 2 秒仅刷新 ts/elapsedSec，便于小窗区分「采集还活着」与「已退出」 */
function heartbeatLiveProgress(outDir) {
  try {
    const p = path.join(outDir, LIVE_PROGRESS_FILE);
    let data = {};
    if (fs.existsSync(p)) {
      data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
    writeLiveProgress(outDir, { ...data, ts: new Date().toISOString() });
  } catch (_) {}
}

/** 小窗「一键切换」：轮询 REQUEST_TOGGLE_DISPLAY，有窗则显/隐 Chrome 窗口，无头则写提示到 live-progress */
function checkToggleDisplay(outDir, headless) {
  const sigPath = path.join(outDir, REQUEST_TOGGLE_DISPLAY);
  if (!fs.existsSync(sigPath)) return;
  try { fs.unlinkSync(sigPath); } catch (_) {}
  if (headless) {
    writeLiveProgress(outDir, { lastMessage: '当前为无头模式，重新运行 HEADLESS=0 后可一键切换显示/后台', lastStatus: null });
    return;
  }
  if (process.platform !== 'darwin') return; // 仅 macOS 用 AppleScript 最小化/还原
  const statePath = path.join(outDir, DISPLAY_STATE_FILE);
  let state = 'visible';
  try {
    if (fs.existsSync(statePath)) state = fs.readFileSync(statePath, 'utf-8').trim() || 'visible';
  } catch (_) {}
  const { execSync } = require('child_process');
  const runOsascript = (script) => {
    try {
      execSync(`osascript -e ${JSON.stringify(script)}`, { stdio: 'pipe', timeout: 5000 });
      return true;
    } catch (e) {
      return false;
    }
  };
  // Chrome 用 minimized（Safari 用 miniaturized）；先直接 tell Chrome，再回退 System Events
  let ok = false;
  if (state === 'visible') {
    ok = runOsascript('tell application "Google Chrome" to set minimized of window 1 to true');
    if (!ok) ok = runOsascript('tell application "System Events" to tell process "Google Chrome" to set miniaturized of front window to true');
    if (ok) fs.writeFileSync(statePath, 'minimized', 'utf-8');
    else writeLiveProgress(outDir, { lastMessage: '一键切换失败：请到 系统设置→隐私与安全性→辅助功能 中勾选终端/Cursor', lastStatus: null });
  } else {
    ok = runOsascript('tell application "Google Chrome" to activate');
    if (!ok) ok = runOsascript('tell application "System Events" to tell process "Google Chrome" to activate');
    if (ok) {
      runOsascript('tell application "Google Chrome" to set minimized of window 1 to false');
      runOsascript('tell application "System Events" to tell process "Google Chrome" to set miniaturized of front window to false');
      fs.writeFileSync(statePath, 'visible', 'utf-8');
    } else {
      writeLiveProgress(outDir, { lastMessage: '一键切换还原失败：请到 辅助功能 中勾选终端/Cursor', lastStatus: null });
    }
  }
}
/** 有序编号计数器文件（与 houses 无关）：删除房源也不会回退，保证 000001、000002… 永不重复 */
const NEXT_OBJECT_NUMBER_FILE = 'next_object_number.json';

/** 若存在 PAUSE 文件则每 5 秒检查一次，直到文件被删除再继续。使用绝对路径避免 cwd 不一致。 */
async function waitIfPaused(outDir, log) {
  const pausePath = path.resolve(outDir, PAUSE_FILE);
  while (fs.existsSync(pausePath)) {
    log(logEntry('info', '[暂停] 已暂停。删除以下文件后继续: ' + pausePath));
    await new Promise((r) => setTimeout(r, 5000));
  }
}

/** 从 houses/<编号或旧houseId>/meta.json 加载已采集户；meta.houseId 优先从文件读，否则用目录名（兼容旧数据） */
function loadExistingMeta(housesDir) {
  const allMeta = [];
  if (!fs.existsSync(housesDir)) return { allMeta };
  const dirs = fs.readdirSync(housesDir);
  for (const name of dirs) {
    const dir = path.join(housesDir, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const metaPath = path.join(dir, 'meta.json');
    if (!fs.existsSync(metaPath)) continue;
    try {
      const m = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      m.houseId = m.houseId || name;
      allMeta.push(m);
    } catch (_) {}
  }
  return { allMeta };
}

/** 建立 网站 houseId -> 目录名 的映射，用于「已采过则跳过」。目录名 = 网站 houseId（如 56975638）；旧数据可能为 6 位编号(000001) 也兼容 */
function loadHouseIdMap(housesDir) {
  const map = {};
  if (!fs.existsSync(housesDir)) return map;
  const dirs = fs.readdirSync(housesDir);
  for (const name of dirs) {
    const dir = path.join(housesDir, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const metaPath = path.join(dir, 'meta.json');
    if (!fs.existsSync(metaPath)) continue;
    try {
      const m = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      const hid = m.houseId || name;
      map[hid] = name;
      if (hid !== name) map[name] = name;
    } catch (_) {}
  }
  return map;
}

/** 目录是否已采完：存在 meta.json 且含 url 与 scrapedAt */
function isFolderComplete(housesDir, folderName) {
  const metaPath = path.join(housesDir, folderName, 'meta.json');
  if (!fs.existsSync(metaPath)) return false;
  try {
    const m = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    return !!(m && m.url && m.scrapedAt);
  } catch (_) {
    return false;
  }
}

/** 未完成且能拿到 url 的目录：meta 里有 url，或无 meta 但有 _url.txt（创建目录时写入），接续时先补采 */
function getIncompleteFoldersWithUrl(housesDir) {
  const list = [];
  if (!fs.existsSync(housesDir)) return list;
  const dirs = fs.readdirSync(housesDir);
  for (const name of dirs) {
    const dir = path.join(housesDir, name);
    if (!fs.statSync(dir).isDirectory() || name.startsWith('.')) continue;
    if (isFolderComplete(housesDir, name)) continue;
    let url = null;
    const metaPath = path.join(dir, 'meta.json');
    const urlTxtPath = path.join(dir, '_url.txt');
    if (fs.existsSync(metaPath)) {
      try {
        const m = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        if (m && m.url && typeof m.url === 'string') url = m.url;
      } catch (_) {}
    }
    if (!url && fs.existsSync(urlTxtPath)) {
      try {
        const s = fs.readFileSync(urlTxtPath, 'utf-8').trim();
        if (s && s.startsWith('http')) url = s;
      } catch (_) {}
    }
    if (url) list.push({ folderName: name, url });
  }
  return list;
}

/**
 * 接续时：先补完所有未完成目录（含仅有 _url.txt 的空壳），再采下一户。不允许出现未完成文件夹后再继续。
 * 目录名 = houseId；文件名仍用 6 位物件编号，从 meta.物件编号 取，若无则用 objectCounter。
 */
async function completeIncompleteFolders(ctx, housesDir, config, houseIdMap, allMeta, log, onProgress, objectCounter, outDir) {
  const list = getIncompleteFoldersWithUrl(housesDir);
  if (list.length === 0) return;
  log(logEntry('info', `[接续] 发现 ${list.length} 个未完成目录，先补采完成再继续`));
  for (const { folderName, url } of list) {
    const houseDir = path.join(housesDir, folderName);
    const houseId = houseIdFromUrl(url);
    let objectNumber;
    const metaPath = path.join(houseDir, 'meta.json');
    if (fs.existsSync(metaPath)) {
      try {
        const m = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        const numRaw = m.物件编号 != null ? String(m.物件编号).trim() : '';
        objectNumber = numRaw ? numRaw.padStart(6, '0') : String(objectCounter.next).padStart(6, '0');
        if (!numRaw) {
          objectCounter.next++;
          saveNextObjectNumber(outDir, objectCounter.next);
        }
      } catch (_) {
        objectNumber = String(objectCounter.next).padStart(6, '0');
        objectCounter.next++;
        saveNextObjectNumber(outDir, objectCounter.next);
      }
    } else {
      objectNumber = String(objectCounter.next).padStart(6, '0');
      objectCounter.next++;
      saveNextObjectNumber(outDir, objectCounter.next);
    }
    const tab = await ctx.newPage();
    try {
      await randomMouseMove(tab, config);
      const result = await scrapeDetail(tab, url, houseDir, config, objectNumber);
      result.meta.houseId = houseId;
      houseIdMap[houseId] = houseId;
      allMeta.push(result.meta);
      if (onProgress) onProgress(allMeta);
      postToAirtableWebhook(result.meta);
      postToSmartTable(result.meta);
      log(logEntry('info', `[接续] 已补采 ${houseId} -> ${folderName}`));
    } catch (e) {
      log(logEntry('error', `[接续] 补采 ${folderName} 失败`, { error: e.message }));
      try {
        await tab.screenshot({ path: path.join(config.outDir, 'error-screenshot.jpg'), type: 'jpeg', quality: 85 });
      } catch (_) {}
    } finally {
      await tab.close();
    }
    await humanDelay(config);
  }
}

/** 读取持久化「下一个编号」；删除 houses 也不会回退，保证有序不重复 */
function loadNextObjectNumber(outDir) {
  const p = path.join(outDir, NEXT_OBJECT_NUMBER_FILE);
  if (!fs.existsSync(p)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    const next = parseInt(data.next, 10);
    return Number.isInteger(next) && next >= 1 ? next : null;
  } catch (_) {
    return null;
  }
}

/** 持久化「下一个编号」；每次分配编号后必须调用，防止重复 */
function saveNextObjectNumber(outDir, next) {
  const p = path.join(outDir, NEXT_OBJECT_NUMBER_FILE);
  try {
    fs.writeFileSync(p, JSON.stringify({ next: Number(next) }, null, 0), 'utf-8');
  } catch (_) {}
}

/** 读取上次保存的进度；有 lastHouseId 或 lastFailedHouseId 即视为有效（仅第一户就失败时只有 lastFailedHouseId） */
function readProgress(outDir, housesDir) {
  const p = path.join(outDir, PROGRESS_FILE);
  if (!fs.existsSync(p)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (data.lastFailedHouseId) return data; // 仅有失败户也可接续，先重试该户
    if (!data.lastHouseId) return null;
    const map = loadHouseIdMap(housesDir);
    const folder = map[data.lastHouseId] || data.lastHouseId;
    const houseDir = path.join(housesDir, folder);
    if (!fs.existsSync(path.join(houseDir, 'meta.json'))) return null;
    return data;
  } catch (_) {
    return null;
  }
}

/** 写入进度，供断线后翻页到该页并从下一户开始；写入时会清除 lastFailedHouseId（该户已成功） */
function writeProgress(outDir, conditionIndex, pageNum, lastHouseId, lastNum) {
  const p = path.join(outDir, PROGRESS_FILE);
  try {
    const payload = { lastConditionIndex: conditionIndex, lastPageNum: pageNum, lastHouseId, lastNum };
    fs.writeFileSync(p, JSON.stringify(payload, null, 0), 'utf-8');
  } catch (_) {}
}

/** 失败时写入「待重试户」，接续时优先重采该户不跳过 */
function writeProgressFailed(outDir, conditionIndex, pageNum, houseId) {
  const p = path.join(outDir, PROGRESS_FILE);
  try {
    let data = {};
    if (fs.existsSync(p)) {
      try { data = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch (_) {}
    }
    data.lastFailedHouseId = houseId;
    data.lastFailedPageNum = pageNum;
    data.lastFailedConditionIndex = conditionIndex;
    fs.writeFileSync(p, JSON.stringify(data, null, 0), 'utf-8');
  } catch (_) {}
}

/** 清除「待重试户」标记（该户已成功或本页未找到，不再重试） */
function clearProgressFailed(outDir) {
  const p = path.join(outDir, PROGRESS_FILE);
  if (!fs.existsSync(p)) return;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    delete data.lastFailedHouseId;
    delete data.lastFailedPageNum;
    delete data.lastFailedConditionIndex;
    fs.writeFileSync(p, JSON.stringify(data, null, 0), 'utf-8');
  } catch (_) {}
}

/** 采集只负责把数据存到本地指定位置（houses/<id>/ + index.json），去重与表格由网站/下游负责，此处不再写 list_all。 */

/** 【准则 v1.0】外部请求带随机扰动的指数退避重试（不阻塞主流程） */
async function fetchWithBackoff(url, options, maxRetries = 3) {
  for (let r = 0; r < maxRetries; r++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return;
      throw new Error(String(res.status));
    } catch (e) {
      if (r === maxRetries - 1) throw e;
      const base = Math.pow(2, r) * 500;
      const jitter = Math.floor(Math.random() * 300);
      await new Promise((res) => setTimeout(res, base + jitter));
    }
  }
}

/** 若配置了 AIRTABLE_WEBHOOK_URL，则 POST 一条 { house_id, fields } 到 Airtable Webhook（不阻塞，失败只打 log） */
function postToAirtableWebhook(meta) {
  const url = (process.env.AIRTABLE_WEBHOOK_URL || '').trim();
  if (!url) return;
  const house_id = meta.houseId || houseIdFromUrl(meta.url);
  const 标签 = [meta.外国籍可 ? '外国籍可' : null, meta.広告掲載 === '可能' ? '広告可' : null].filter(Boolean).join(',');
  const payload = {
    house_id,
    fields: {
      物件名: meta.物件名,
      賃料: meta.賃料,
      住所: meta.住所,
      専有面積: meta.専有面積,
      部屋番号: meta.部屋番号,
      更新日: meta.更新日,
      标签,
    },
  };
  fetchWithBackoff(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch((e) => console.warn('[airtable-webhook] POST failed', e.message));
}

/** 若配置了 SMART_TABLE_WEBHOOK_URL 和 SMART_TABLE_FIELD_MAP，则按智能表格的 schema + add_records 格式 POST 一条 */
function postToSmartTable(meta) {
  const url = (process.env.SMART_TABLE_WEBHOOK_URL || '').trim();
  let fieldMap = null;
  try {
    const raw = process.env.SMART_TABLE_FIELD_MAP || '';
    if (raw) fieldMap = JSON.parse(raw);
  } catch (_) {}
  if (!url || !fieldMap || typeof fieldMap !== 'object') return;
  const types = (() => {
    try {
      const raw = process.env.SMART_TABLE_TYPES || '{}';
      return JSON.parse(raw);
    } catch (_) {
      return {};
    }
  })();
  const 标签 = [meta.外国籍可 ? '外国籍可' : null, meta.広告掲載 === '可能' || meta.広告掲載 === '可' ? '広告可' : null].filter(Boolean).join(',');
  const row = {
    ...meta,
    标签: meta.标签 || 标签,
  };
  const schema = {};
  const values = {};
  for (const [ourField, fieldId] of Object.entries(fieldMap)) {
    if (!fieldId || typeof fieldId !== 'string') continue;
    const type = types[fieldId] || '文本';
    schema[fieldId] = type;
    let v = row[ourField] != null ? row[ourField] : '';
    if (type === '数字') {
      const n = parseFloat(String(v).replace(/[^\d.]/g, ''));
      values[fieldId] = isNaN(n) ? 0 : n;
    } else if (type === '日期' && v) {
      const d = new Date(v);
      values[fieldId] = isNaN(d.getTime()) ? '' : String(d.getTime());
    } else {
      values[fieldId] = typeof v === 'string' ? v : String(v);
    }
  }
  const payload = { schema, add_records: [{ values }] };
  fetchWithBackoff(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch((e) => console.warn('[smart-table] POST failed', e.message));
}

/**
 * 从 MUI 翻页区读取当前页码（选中按钮的文本）。
 * 翻页区：nav[aria-label="ページ選択"]，当前页为带 Mui-selected 的按钮。
 */
async function getCurrentListPageNumber(page) {
  const num = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="ページ選択"]');
    if (!nav) return 1;
    const selected = nav.querySelector('.Mui-selected.MuiPaginationItem-page');
    if (!selected) return 1;
    const t = parseInt(selected.textContent, 10);
    return Number.isFinite(t) ? t : 1;
  });
  return num;
}

/**
 * 获取翻页区内可点击的页码（数字按钮，非 disabled）。返回数字数组，如 [2,3,4,5,106]。
 */
async function getVisiblePageNumbers(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="ページ選択"]');
    if (!nav) return [];
    const buttons = nav.querySelectorAll('button.MuiPaginationItem-page:not(.Mui-disabled)');
    const nums = [];
    buttons.forEach((btn) => {
      const t = parseInt(btn.textContent, 10);
      if (Number.isFinite(t)) nums.push(t);
    });
    return nums;
  });
}

/**
 * 用「优先点页码、否则点次へ」的方式跳到目标页，拟人化延迟与点击。
 * 从当前页到 targetPageNum，尽量点可见的页码按钮以减少点击次数（如到第50页可点 5→10→20→40→50）。
 * 返回 { pageNum, listStep } 供调用方同步 listStep。
 */
async function goToListPage(page, targetPageNum, listDelay, startListStep, log) {
  let current = await getCurrentListPageNumber(page);
  let listStep = startListStep;
  const maxSteps = 500;
  while (current < targetPageNum && (maxSteps - listStep + startListStep) > 0) {
    const visible = await getVisiblePageNumbers(page);
    const nextCandidates = visible.filter((n) => n > current && n <= targetPageNum);
    const nextPage = nextCandidates.length ? Math.max(...nextCandidates) : null;
    if (nextPage != null && nextPage > current) {
      const btn = page.locator('nav[aria-label="ページ選択"]').getByRole('button', { name: String(nextPage) }).first();
      if ((await btn.count()) && !(await btn.getAttribute('disabled'))) {
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await listDelay(listStep++);
        await clickWithOffset(page, btn);
        await page.waitForLoadState(config.loadStrategy || 'networkidle', { timeout: 30000 }).catch(() => {});
        await listDelay(listStep++);
        await page.evaluate(() => window.scrollTo(0, 0));
        current = nextPage;
        if (log) log(logEntry('info', `[翻页] 点页码 ${nextPage}，当前第 ${nextPage} 页`));
        continue;
      }
    }
    const nextBtn = page.getByText('次へ').first();
    if ((await nextBtn.count()) === 0) break;
    const disabled = await nextBtn.getAttribute('disabled').catch(() => null);
    const ariaDisabled = await nextBtn.getAttribute('aria-disabled').catch(() => null);
    if (disabled !== null || ariaDisabled === 'true') break;
    await nextBtn.scrollIntoViewIfNeeded().catch(() => {});
    await listDelay(listStep++);
    await clickWithOffset(page, nextBtn);
    await page.waitForLoadState(config.loadStrategy || 'networkidle', { timeout: 30000 }).catch(() => {});
    await listDelay(listStep++);
    await page.evaluate(() => window.scrollTo(0, 0));
    current++;
  }
  return { pageNum: current, listStep };
}

/**
 * 列表页：一栋楼可能多间房，每间房是一个「板块」（蓝框），板块内才有状态【募集中】和【詳細】。
 * 只采「板块内标募集中」的那间，点该板块内的【詳細】；同一栋里申込済的板块不采。
 */
function collectRecruitingLinksFromCurrentPage(page, listUrl) {
  return page.evaluate((baseUrl) => {
    const out = [];
    // 找所有「最小板块」：自身含 募集中 且含 rent_rooms 链接，且没有子元素也同时满足（避免取到整栋大容器）
    function walk(el) {
      if (!el || el.nodeType !== 1) return;
      const text = (el.textContent || '').trim();
      if (!text.includes('募集中')) {
        for (let i = 0; i < el.children.length; i++) walk(el.children[i]);
        return;
      }
      const linkEl = el.querySelector('a[href*="rent_rooms"]');
      if (!linkEl) {
        for (let i = 0; i < el.children.length; i++) walk(el.children[i]);
        return;
      }
      // 有子节点也满足「含募集中且含链接」则只递归子节点，不把本节点当板块
      for (let i = 0; i < el.children.length; i++) {
        const c = el.children[i];
        const ct = (c.textContent || '').trim();
        if (ct.includes('募集中') && c.querySelector('a[href*="rent_rooms"]')) {
          for (let j = 0; j < el.children.length; j++) walk(el.children[j]);
          return;
        }
      }
      // 本节点为最小板块，取板块内优先「詳細」再 fallback 任意 rent_rooms
      const allLinks = el.querySelectorAll('a[href*="rent_rooms"]');
      let detailA = null;
      for (const a of allLinks) {
        if ((a.textContent || '').trim().includes('詳細')) { detailA = a; break; }
      }
      if (!detailA && allLinks.length) detailA = allLinks[0];
      const href = detailA ? detailA.getAttribute('href') : null;
      if (href) out.push(href.startsWith('http') ? href : new URL(href, baseUrl).href);
    }
    walk(document.body);
    return [...new Set(out)];
  }, listUrl);
}

/**
 * 一条件：先选条件出列表，然后「收一页 → 本页每条在新标签点开采 → 翻页」循环。
 * resumeFrom：断线重连时 { lastConditionIndex, lastPageNum, lastHouseId }，会翻页到该页并从下一户开始采。
 */
async function runConditionCollectAndScrapePerPage(page, conditionIndex, config, log, outDir, housesDir, allMeta, objectCounter, onProgress, resumeFrom) {
  const label = conditionLabels[conditionIndex];
  /** 【准则 v1.0】确认延迟 300-550ms，手热效应由 stepIndex 控制 */
  const listDelay = (stepIndex = 0) => listDelayFn(config, stepIndex);
  let listStep = 0;
  // 条件2 时当前页可能是条件1的结果页，「条件呼び出し」不可见，先回到列表页
  if (conditionIndex > 0) {
    await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await listDelay(listStep++);
  }
  const callBtn = page.getByText('条件呼び出し').first();
  await callBtn.waitFor({ state: 'visible', timeout: 60000 });
  await callBtn.scrollIntoViewIfNeeded().catch(() => {});
  await clickWithOffset(page, callBtn);
  await listDelay(listStep++);
  const opt = page.getByText(label, { exact: false }).or(page.getByText(/外国人可.*0.*25/)).first();
  await opt.waitFor({ state: 'visible', timeout: 45000 });
  await opt.scrollIntoViewIfNeeded().catch(() => {});
  await clickWithOffset(page, opt);
  await listDelay(listStep++);
  const searchBtn = page.getByText('検索').first();
  await searchBtn.waitFor({ state: 'visible', timeout: 15000 });
  await searchBtn.scrollIntoViewIfNeeded().catch(() => {});
  await clickWithOffset(page, searchBtn);
  await page.waitForLoadState(config.loadStrategy || 'networkidle', { timeout: 30000 }).catch(() => {});
  await listDelay(listStep++);
  const listUrlExpected = 'rent_rooms/list';
  const currentUrl = page.url();
  if (!currentUrl.includes(listUrlExpected) || currentUrl.includes('itandi-accounts.com/login')) {
    log(logEntry('warn', `[与预设不符] 预期：列表页（含 ${listUrlExpected}）；实际：${currentUrl}`));
    try {
      const debugPath = path.join(outDir, 'xai-debug-unexpected-page.jpg');
      await page.screenshot({ path: debugPath, type: 'jpeg', quality: 85 });
      const { analyzeScreenshot } = require('../scripts/xai-vision-analyze.js');
      log(logEntry('info', '[xAI] 正在用视觉分析当前页面（已附带项目流程说明）…'));
      await analyzeScreenshot(debugPath, `预期：点击検索后应在列表页；实际 URL：${currentUrl}`, outDir);
    } catch (e) {
      log(logEntry('warn', '[xAI] 视觉分析失败', { error: e.message }));
    }
  }
  const ctx = page.context();
  let pageNum = 1;
  const maxPages = Math.min(200, Math.max(1, parseInt(process.env.MAX_PAGES, 10) || 200));
  if (maxPages < 200) log(logEntry('info', `[限制] 本条件最多采集 ${maxPages} 页（MAX_PAGES=${process.env.MAX_PAGES}）`));
  const isResumingThisCondition = resumeFrom && (
    resumeFrom.lastConditionIndex === conditionIndex ||
    (resumeFrom.lastFailedConditionIndex != null && resumeFrom.lastFailedConditionIndex === conditionIndex)
  );

  const targetPage = (resumeFrom && resumeFrom.lastFailedHouseId != null && resumeFrom.lastFailedPageNum != null)
    ? resumeFrom.lastFailedPageNum
    : (resumeFrom ? resumeFrom.lastPageNum : 1);
  if (isResumingThisCondition && targetPage > 1) {
    log(logEntry('info', `[接续] 条件 ${conditionIndex + 1} 翻页到第 ${targetPage} 页（优先点页码，减少点击次数）`));
    const { pageNum: reached, listStep: newStep } = await goToListPage(page, targetPage, listDelay, listStep, log);
    pageNum = reached;
    listStep = newStep;
  }

  let houseIdMap = loadHouseIdMap(housesDir);

  if (isResumingThisCondition) {
    await completeIncompleteFolders(ctx, housesDir, config, houseIdMap, allMeta, log, onProgress, objectCounter, outDir);
  }

  while (pageNum <= maxPages) {
    await waitIfPaused(outDir, log);
    let pageLinks = await collectRecruitingLinksFromCurrentPage(page, LIST_URL);
    if (pageLinks.length === 0 && pageNum <= maxPages) {
      log(logEntry('info', `[重试] 第 ${pageNum} 页 0 条，重新加载列表后再收一次`));
      await page.goto(LIST_URL, { waitUntil: config.loadStrategy || 'networkidle', timeout: 30000 }).catch(() => {});
      await listDelay(listStep++);
      const { listStep: newStep } = await goToListPage(page, pageNum, listDelay, listStep, log);
      listStep = newStep;
      pageLinks = await collectRecruitingLinksFromCurrentPage(page, LIST_URL);
      if (pageLinks.length === 0) {
        log(logEntry('info', `[重试] 仍为 0 条，可能本页无募集中或列表结构变化`));
        try {
          const debugPath = path.join(outDir, 'xai-debug-0links.jpg');
          await page.screenshot({ path: debugPath, type: 'jpeg', quality: 85 });
          const { analyzeScreenshot } = require('../scripts/xai-vision-analyze.js');
          const ctx = `条件${conditionIndex + 1} 第${pageNum} 页 募集中0条，重试后仍0条`;
          log(logEntry('info', '[xAI] 正在用视觉分析当前页面…'));
          const analysis = await analyzeScreenshot(debugPath, ctx, outDir);
          if (analysis) log(logEntry('info', '[xAI] 分析已写入 scraper-out/xai-vision-analysis.txt'));
        } catch (e) {
          log(logEntry('warn', '[xAI] 视觉分析失败', { error: e.message }));
        }
      }
    }
    const resumePageNum = (resumeFrom && resumeFrom.lastFailedHouseId != null && resumeFrom.lastFailedPageNum != null) ? resumeFrom.lastFailedPageNum : (resumeFrom ? resumeFrom.lastPageNum : null);
    const onResumePage = resumeFrom && isResumingThisCondition && resumePageNum != null && pageNum === resumePageNum;
    let startIndex = 0;
    if (onResumePage && resumeFrom && resumeFrom.lastFailedHouseId) {
      const idxFailed = pageLinks.findIndex((url) => houseIdFromUrl(url) === resumeFrom.lastFailedHouseId);
      if (idxFailed >= 0) {
        startIndex = idxFailed;
        log(logEntry('info', `[接续] 本页从第 ${startIndex + 1} 条开始（先重试上一轮失败户 ${resumeFrom.lastFailedHouseId}，禁止跳过）`));
      } else {
        log(logEntry('info', `[接续] 本页未找到上一轮失败户 ${resumeFrom.lastFailedHouseId}（可能已下架），清除待重试并按上次成功户接续`));
        clearProgressFailed(outDir);
      }
    }
    if (onResumePage && resumeFrom && resumeFrom.lastHouseId && startIndex === 0) {
      let idx = pageLinks.findIndex((url) => houseIdFromUrl(url) === resumeFrom.lastHouseId);
      if (idx >= 0) {
        startIndex = idx + 1;
        log(logEntry('info', `[接续] 本页从第 ${startIndex} 条开始（上次完成于 ${resumeFrom.lastHouseId}）`));
      } else {
        const lastHouseId = resumeFrom.lastHouseId;
        let found = false;
        for (let d = 1; d <= RESUME_SEARCH_PAGE_RANGE && !found; d++) {
          for (const delta of [-d, d]) {
            if (found) break;
            const tryPage = pageNum + delta;
            if (tryPage < 1 || tryPage > maxPages) continue;
            const { listStep: newStep } = await goToListPage(page, tryPage, listDelay, listStep, log);
            listStep = newStep;
            const links = await collectRecruitingLinksFromCurrentPage(page, LIST_URL);
            const j = links.findIndex((url) => houseIdFromUrl(url) === lastHouseId);
            if (j >= 0) {
              pageNum = tryPage;
              startIndex = j + 1;
              pageLinks = links;
              found = true;
              log(logEntry('info', `[接续] 断点户 ${lastHouseId} 在第 ${tryPage} 页找到，从该页第 ${startIndex} 条继续`));
              break;
            }
          }
        }
        if (!found) {
          const back = await goToListPage(page, resumeFrom.lastPageNum, listDelay, listStep, log);
          listStep = back.listStep;
          pageNum = back.pageNum;
          pageLinks = await collectRecruitingLinksFromCurrentPage(page, LIST_URL);
          log(logEntry('info', `[接续] 本页及前后页未找到断点户 ${lastHouseId}（可能已下架/申込あり或列表顺序变化），从本页首条继续，已采户会跳过`));
        }
      }
    }
    log(logEntry('info', `[条件 ${conditionIndex + 1}] 第 ${pageNum} 页 募集中 ${pageLinks.length} 条`));
    writeLiveProgress(outDir, { conditionLabel: conditionLabels[conditionIndex], conditionIndex, pageNum, pageTotalOnPage: pageLinks.length, totalCollected: allMeta.length, lastMessage: `条件${conditionIndex + 1} 第${pageNum}页 共${pageLinks.length}条`, lastStatus: null });

    for (let i = 0; i < pageLinks.length; i++) {
      await waitIfPaused(outDir, log);
      const url = pageLinks[i];
      const houseId = houseIdFromUrl(url);
      const folder = houseIdMap[houseId];
      if (folder) {
        const houseDir = path.join(housesDir, folder);
        if (onResumePage && i < startIndex) {
          try {
            const existing = JSON.parse(fs.readFileSync(path.join(houseDir, 'meta.json'), 'utf-8'));
            existing.houseId = existing.houseId || houseId;
            allMeta.push(existing);
            if (onProgress) onProgress(allMeta);
          } catch (_) {}
        } else {
          try {
            const existing = JSON.parse(fs.readFileSync(path.join(houseDir, 'meta.json'), 'utf-8'));
            existing.houseId = existing.houseId || houseId;
            allMeta.push(existing);
            if (onProgress) onProgress(allMeta);
            postToAirtableWebhook(existing);
            postToSmartTable(existing);
            log(logEntry('info', `[接续] 跳过已采 ${houseId}`));
          } catch (_) {}
        }
        continue;
      }
      const objectNumber = String(objectCounter.next).padStart(6, '0');
      objectCounter.next++;
      const houseDir = path.join(housesDir, houseId);
      saveNextObjectNumber(outDir, objectCounter.next);
      fs.mkdirSync(houseDir, { recursive: true });
      fs.writeFileSync(path.join(houseDir, '_url.txt'), url, 'utf-8');
      const detailTab = await ctx.newPage();
      const maxDetailRetries = 3;
      let result = null;
      try {
        await randomMouseMove(detailTab, config);
        for (let attempt = 0; attempt <= maxDetailRetries; attempt++) {
          try {
            result = await scrapeDetail(detailTab, url, houseDir, config, objectNumber);
            break;
          } catch (e) {
            const msg = (e && (e.message || String(e))) || '';
            const isBrowserClosed = /Target page, context or browser has been closed/i.test(msg);
            if (isBrowserClosed) {
              log(logEntry('info', `[条件${conditionIndex + 1} 第${pageNum}页] ${houseId} 浏览器/标签已关闭，不重试，直接失败并截图报 xAI`, { error: msg }));
              throw e;
            }
            if (attempt < maxDetailRetries) {
              const backoff = 1000 + Math.floor(Math.random() * 1500);
              log(logEntry('info', `[条件${conditionIndex + 1} 第${pageNum}页] ${houseId} 第 ${attempt + 1} 次失败，${backoff}ms 后重试`, { error: msg }));
              await new Promise((r) => setTimeout(r, backoff));
            } else {
              throw e;
            }
          }
        }
        if (result) {
          result.meta.houseId = houseId;
          houseIdMap[houseId] = houseId;
          allMeta.push(result.meta);
          if (onProgress) onProgress(allMeta);
          postToAirtableWebhook(result.meta);
          postToSmartTable(result.meta);
          writeProgress(outDir, conditionIndex, pageNum, houseId, objectCounter.next - 1);
          log(logEntry('info', `[条件${conditionIndex + 1} 第${pageNum}页 ${i + 1}/${pageLinks.length}] ${houseId} OK`, { durationMs: result.durationMs }));
          writeLiveProgress(outDir, { conditionLabel: conditionLabels[conditionIndex], conditionIndex, pageNum, houseIndex: i + 1, pageTotalOnPage: pageLinks.length, houseId, totalCollected: allMeta.length, lastMessage: `${houseId} OK`, lastStatus: 'OK' });
        }
      } catch (e) {
        let errMsg = (e && (e.message || String(e))) || '未知错误';
        if (/Target page, context or browser has been closed/i.test(errMsg)) {
          errMsg = '浏览器或标签页已关闭（可能崩溃/人为关闭），请重新运行接续';
        }
        log(logEntry('error', `[条件${conditionIndex + 1} 第${pageNum}页 ${i + 1}/${pageLinks.length}] ${houseId} FAIL`, { error: errMsg }));
        writeLiveProgress(outDir, { conditionLabel: conditionLabels[conditionIndex], conditionIndex, pageNum, houseIndex: i + 1, pageTotalOnPage: pageLinks.length, houseId, totalCollected: allMeta.length, lastMessage: `${houseId} FAIL`, lastStatus: 'FAIL', lastError: errMsg });
        writeProgressFailed(outDir, conditionIndex, pageNum, houseId);
        const errorScreenshotPath = path.join(outDir, 'error-screenshot.jpg');
        try {
          await detailTab.screenshot({ path: errorScreenshotPath, type: 'jpeg', quality: 85 });
        } catch (_) {
          try {
            await page.screenshot({ path: errorScreenshotPath, type: 'jpeg', quality: 85 });
          } catch (_) {}
        }
        try {
          if (fs.existsSync(errorScreenshotPath)) {
            const { analyzeScreenshot } = require('../scripts/xai-vision-analyze.js');
            const ctx = `详情采集失败 houseId=${houseId} 条件${conditionIndex + 1} 第${pageNum}页 错误=${errMsg}`;
            log(logEntry('info', '[xAI] 详情失败，正在用视觉分析当前页面以改正流程…'));
            await analyzeScreenshot(errorScreenshotPath, ctx, outDir);
          } else {
            log(logEntry('warn', '[xAI] 无法截图（浏览器/标签已关闭），跳过视觉分析'));
          }
        } catch (e) {
          log(logEntry('warn', '[xAI] 视觉分析失败', { error: (e && e.message) || String(e) }));
        }
        try {
          const metaPath = path.join(houseDir, 'meta.json');
          if (fs.existsSync(metaPath)) {
            const existing = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            existing.houseId = existing.houseId || houseId;
            houseIdMap[houseId] = houseId;
            allMeta.push(existing);
            if (onProgress) onProgress(allMeta);
            postToAirtableWebhook(existing);
            postToSmartTable(existing);
          } else {
            try { fs.rmSync(houseDir, { recursive: true }); } catch (_) {}
            log(logEntry('info', `[半成品已删] ${houseDir} 无 meta.json，已删除，接续时会重试该户`));
          }
        } catch (_) {}
      } finally {
        try { await detailTab.close(); } catch (_) {}
      }
      await humanDelay({ minDelayMs: 300, maxDelayMs: 700 });
    }

    const nextBtn = page.getByText('次へ').first();
    const nextCount = await nextBtn.count();
    if (nextCount === 0) break;
    const disabled = await nextBtn.getAttribute('disabled').catch(() => null);
    const ariaDisabled = await nextBtn.getAttribute('aria-disabled').catch(() => null);
    if (disabled !== null || ariaDisabled === 'true') break;

    await nextBtn.scrollIntoViewIfNeeded().catch(() => {});
    await listDelay(listStep++);
    await clickWithOffset(page, nextBtn);
    await page.waitForLoadState(config.loadStrategy || 'networkidle', { timeout: 30000 }).catch(() => {});
    await listDelay(listStep++);
    await page.evaluate(() => window.scrollTo(0, 0));
    await listDelay(listStep++);
    pageNum++;
    if (isResumingThisCondition) resumeFrom = null;
  }
}

async function main() {
  const pausePath = path.resolve(config.outDir, PAUSE_FILE);
  console.log('[mimap] 采集启动中…（暂停请执行: touch "' + pausePath + '"）');
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const logPath = path.join(config.outDir, `daily_${dateStr}.jsonl`);
  const reportPath = path.join(config.outDir, `report_${dateStr}.md`);
  fs.mkdirSync(config.outDir, { recursive: true });
  const housesDir = path.join(config.outDir, 'houses');
  fs.mkdirSync(housesDir, { recursive: true });

  const log = (entry) => {
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(logPath, line);
    if (entry.level === 'error') console.error(entry.msg, entry);
    else console.log(entry.msg);
  };

  const headless = process.env.HEADLESS === '1' || process.env.HEADLESS === 'true';
  if (headless) console.log('[mimap] 后台模式（HEADLESS=1）：浏览器无界面运行，不占用屏幕；拟人化延迟与防追踪逻辑不变。');
  if (config.skilledMode) console.log('[mimap] 熟练工模式（SKILLED_MODE=1）：鼠标/滚动/延迟已收紧，导航 domcontentloaded，slowMo=0，起点记上次位置。');
  const launchOptions = {
    headless,
    channel: 'chrome',
    slowMo: config.slowMo ?? 0,
    viewport: headless ? { width: 1920, height: 1080 } : null,
    ignoreDefaultArgs: ['--enable-automation'],
    args: headless ? ['--no-first-run', '--no-sandbox'] : ['--no-first-run', '--start-maximized'],
    userAgent: getRandomUserAgent(),
  };
  const launchTimeoutMs = 60000;
  const context = await Promise.race([
    chromium.launchPersistentContext(config.userDataDir, launchOptions),
    new Promise((_, rej) => setTimeout(() => rej(new Error('浏览器启动超时 ' + launchTimeoutMs / 1000 + ' 秒，请检查 Chrome 是否已安装、pw-profile 是否被占用')), launchTimeoutMs)),
  ]);

  const page = context.pages()[0] || await context.newPage();
  context.on('page', (p) => { try { p.on('dialog', (d) => d.accept()); } catch (_) {} });
  try { page.on('dialog', (d) => d.accept()); } catch (_) {}
  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await humanDelay(config);
  _runStartTime = Date.now();
  _housesDirForProgress = housesDir;
  _totalInRepoAtStart = housesDir ? countHousesInRepo(housesDir) : 0;
  try {
    const rt = JSON.parse(fs.readFileSync(path.join(config.outDir, TOTAL_RUNTIME_FILE), 'utf-8'));
    _previousTotalSec = rt.seconds || 0;
  } catch (_) { _previousTotalSec = 0; }
  let screenshotInterval = null;
  const heartbeatInterval = setInterval(() => {
    heartbeatLiveProgress(config.outDir);
    checkToggleDisplay(config.outDir, headless);
  }, 2000);
  if (process.env.HEADLESS && page) {
    screenshotInterval = setInterval(() => {
      page.screenshot({
        path: path.join(config.outDir, BROWSER_PREVIEW_FILE),
        type: 'jpeg',
        quality: BROWSER_PREVIEW_QUALITY,
        clip: BROWSER_PREVIEW_CLIP,
      }).catch(() => {});
    }, 5000);
  }
  if (page.url().includes('itandi-accounts.com/login')) {
    log(logEntry('info', '检测到登录页，尝试使用 .env 中的账号密码自动登录…'));
    const ok = await tryAutoLogin(page);
    if (ok) {
      await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await humanDelay(config);
    }
    if (page.url().includes('itandi-accounts.com/login')) {
      log(logEntry('error', '检测到登录页，登录态已失效。请先运行 node login-itandi.js 完成登录后重试。'));
      try {
        const loginFailPath = path.join(config.outDir, 'xai-debug-login-fail.jpg');
        await page.screenshot({ path: loginFailPath, type: 'jpeg', quality: 85 });
        const { analyzeScreenshot } = require('../scripts/xai-vision-analyze.js');
        log(logEntry('info', '[xAI] 登录失败，正在用视觉分析当前页面以改正流程…'));
        await analyzeScreenshot(loginFailPath, '登录失败，仍在登录页，采集无法继续', config.outDir);
      } catch (_) {}
      await context.close();
      process.exit(1);
    }
  }

  const { allMeta: existingMeta } = loadExistingMeta(housesDir);
  const allMeta = [...existingMeta];
  // 编号只从持久化计数器读，删除 houses 也不会回退，保证 000001、000002… 永不重复
  let nextNum = loadNextObjectNumber(config.outDir);
  if (nextNum == null) nextNum = 1;
  const progress = readProgress(config.outDir, housesDir);
  const resumeFrom = progress ? {
    lastConditionIndex: progress.lastConditionIndex,
    lastPageNum: progress.lastPageNum,
    lastHouseId: progress.lastHouseId,
    lastFailedHouseId: progress.lastFailedHouseId || null,
    lastFailedPageNum: progress.lastFailedPageNum,
    lastFailedConditionIndex: progress.lastFailedConditionIndex,
  } : null;
  if (progress && (progress.lastNum != null || progress.lastNum === 0)) {
    const resumeNext = progress.lastNum + 1;
    if (resumeNext > nextNum) nextNum = resumeNext;
  }
  const objectCounter = { next: nextNum };
  saveNextObjectNumber(config.outDir, nextNum); // 启动时也持久化，避免重复
  if (progress) {
    if (resumeFrom && resumeFrom.lastFailedHouseId) {
      log(logEntry('info', `[接续] 已加载 ${existingMeta.length} 户，先重试上一轮失败户 ${resumeFrom.lastFailedHouseId}（条件${(resumeFrom.lastFailedConditionIndex ?? resumeFrom.lastConditionIndex) + 1} 第${resumeFrom.lastFailedPageNum ?? resumeFrom.lastPageNum}页），再继续新户，编号 ${String(objectCounter.next).padStart(6, '0')}`));
    } else {
      log(logEntry('info', `[接续] 已加载 ${existingMeta.length} 户，从条件${progress.lastConditionIndex + 1} 第${progress.lastPageNum}页、下一户开始，编号 ${String(objectCounter.next).padStart(6, '0')}`));
    }
  } else if (existingMeta.length) {
    log(logEntry('info', `[接续] 已加载 ${existingMeta.length} 户，下一编号 ${String(objectCounter.next).padStart(6, '0')}`));
  } else {
    log(logEntry('info', `[编号] 下一编号 ${String(objectCounter.next).padStart(6, '0')}（持久化于 ${NEXT_OBJECT_NUMBER_FILE}，删除房源也不会重复）`));
  }
  const onProgress = () => {}; // 表格/去重交给网站，采集过程不再写 list

  const startCondition = (resumeFrom && resumeFrom.lastFailedHouseId != null && resumeFrom.lastFailedConditionIndex != null)
    ? resumeFrom.lastFailedConditionIndex
    : (resumeFrom ? resumeFrom.lastConditionIndex : 0);
  const maxConditions = process.env.MAX_PAGES ? 1 : 2; // MAX_PAGES 时只跑一个条件（共 N 页）就停，方便「跑两页回来报告」
  if (resumeFrom) log(logEntry('info', `[接续] 从条件 ${startCondition + 1} 继续`));
  writeLiveProgress(config.outDir, { lastMessage: '采集启动中…', totalCollected: allMeta.length });
  for (let c = startCondition; c < Math.min(2, startCondition + maxConditions); c++) {
    try {
      log(logEntry('info', `[条件 ${c + 1}/2] 选条件 → 每页收链接后直接新标签点开采図面/图片/文本/快照 → 再翻页`));
      await runConditionCollectAndScrapePerPage(page, c, config, log, config.outDir, housesDir, allMeta, objectCounter, onProgress, c === startCondition ? resumeFrom : null);
    } catch (e) {
      try {
        if (page && !page.isClosed()) {
          await page.screenshot({ path: path.join(config.outDir, 'error-screenshot.jpg'), type: 'jpeg', quality: 85 });
          const { analyzeScreenshot } = require('../scripts/xai-vision-analyze.js');
          log(logEntry('warn', '[与预设不符] 未预期的异常，已截屏并请 xAI 分析（已附带项目流程说明）', { error: e.message }));
          await analyzeScreenshot(path.join(config.outDir, 'error-screenshot.jpg'), `未预期的异常（流程中抛出）：${e.message}`, config.outDir);
        }
      } catch (_) {}
      throw e;
    }
  }
  if (screenshotInterval) clearInterval(screenshotInterval);
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  const finalElapsed = (Date.now() - _runStartTime) / 1000;
  try {
    fs.writeFileSync(path.join(config.outDir, TOTAL_RUNTIME_FILE), JSON.stringify({ seconds: _previousTotalSec + finalElapsed }), 'utf-8');
  } catch (_) {}
  await context.close();

  // 只负责存数据：更新 index.json 供网站/下游使用，去重与表格由对方负责
  const buildIndexPath = path.join(root, 'scripts', 'build-view-index.js');
  if (fs.existsSync(buildIndexPath)) {
    try {
      require('child_process').spawnSync(process.execPath, [buildIndexPath], { cwd: root, stdio: 'inherit' });
    } catch (_) {}
  }

  const count = allMeta.length;
  const report = `# report_${dateStr}\n\n- 采集: ${count} 户\n- 数据位置: scraper-out/houses/<id>/ + scraper-out/index.json\n- 日志: daily_${dateStr}.jsonl\n- 去重与表格由网站/下游处理\n`;
  fs.writeFileSync(reportPath, report, 'utf-8');

  const summary = `抓取完成\n采集: ${count} 户\n数据已写入: houses/ 与 index.json（指定位置）\n去重与表格由网站接替\nreport: ${reportPath}\n日志: ${logPath}\n`;
  fs.writeFileSync(path.join(config.outDir, 'summary.txt'), summary, 'utf-8');
  try { fs.unlinkSync(path.join(config.outDir, PROGRESS_FILE)); } catch (_) {}
  writeLiveProgress(config.outDir, { lastMessage: `采集完成 共 ${count} 户`, totalCollected: count, lastStatus: 'DONE' });
  log(logEntry('info', '[完成] 数据已写入 houses/ 与 index.json，report、summary 已写入', { count }));
}

main().catch((e) => {
  const fs = require('fs');
  const path = require('path');
  const config = require('./config');
  fs.mkdirSync(config.outDir, { recursive: true });
  const isBrowserClosed = /closed|has been closed/i.test(e.message || '');
  const summary = isBrowserClosed
    ? `抓取中断（浏览器已关闭或崩溃，如弹窗「Google Chrome 意外退出」）\nerror: ${e.message}\n\n请点弹窗里的「忽略」，然后重新运行：\n  ./run.sh  或  node scraper/run.js\n会从 progress 自动接续，编号不会重复。\n`
    : `抓取失败\nerror: ${e.message}\n`;
  fs.writeFileSync(path.join(config.outDir, 'summary.txt'), summary, 'utf-8');
  console.error(e);
  if (isBrowserClosed) console.error('\n→ 请点弹窗「忽略」后重新运行 ./run.sh 或 node scraper/run.js，会从断点接续。');
  process.exit(1);
});
