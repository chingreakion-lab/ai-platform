/**
 * 拟人化：随机停留、鼠标、滚动、User-Agent，全程使用
 * 支持「新手 / 熟练工」两套参数：SKILLED_MODE=1 时用熟练工（更快、仍拟人）
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

const NOVICE = {
  mouseStepsMin: 20,
  mouseStepsMax: 40,
  mouseStepDelayMin: 5,
  mouseStepDelayMax: 25,
  mouseArrivalPauseMin: 100,
  mouseArrivalPauseMax: 400,
  scrollDelayMin: 300,
  scrollDelayMax: 1200,
  humanDelayMin: 500,
  humanDelayMax: 2000,
  typingIntervalMin: 80,
  typingIntervalMax: 220,
  longPauseProbability: 0.08,
};
const SKILLED = {
  mouseStepsMin: 10,
  mouseStepsMax: 18,
  mouseStepDelayMin: 3,
  mouseStepDelayMax: 12,
  mouseArrivalPauseMin: 50,
  mouseArrivalPauseMax: 120,
  scrollDelayMin: 100,
  scrollDelayMax: 300,
  humanDelayMin: 200,
  humanDelayMax: 600,
  typingIntervalMin: 40,
  typingIntervalMax: 100,
  longPauseProbability: 0.03,
};

let _lastMouseX = null;
let _lastMouseY = null;

function getPreset(config = {}) {
  return config.skilledMode ? SKILLED : NOVICE;
}

function randomDelay(minMs, maxMs) {
  const min = minMs ?? 5000;
  const max = maxMs ?? 20000;
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((r) => setTimeout(r, ms));
}

async function humanDelay(config = {}) {
  const preset = getPreset(config);
  const min = config.minDelayMs ?? preset.humanDelayMin;
  const max = config.maxDelayMs ?? preset.humanDelayMax;
  await randomDelay(min, max);
  if (Math.random() < preset.longPauseProbability) {
    await randomDelay(400, 1200);
  }
}

/** 【准则 v1.0】列表/重复任务确认延迟；手热效应：随 stepIndex 增加线性微调至更紧凑 */
function listDelayMs(config = {}, stepIndex = 0) {
  const minF = config.listDelayMinFloorMs ?? 250;
  const high = config.listDelayMaxMs ?? 550;
  const k = Math.min(high - minF, Math.max(0, stepIndex) * 15);
  return Math.max(minF, high - k);
}

async function listDelay(config = {}, stepIndex = 0) {
  const ms = listDelayMs(config, stepIndex);
  return new Promise((r) => setTimeout(r, ms));
}

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/** 鼠标轨迹：步数+每步延迟+到达停顿；熟练工模式下起点=上次终点 */
async function randomMouseMove(page, config = {}) {
  try {
    const v = page.viewportSize() || { width: 1920, height: 1080 };
    const preset = getPreset(config);
    const w = Math.max(100, v.width - 100);
    const h = Math.max(100, v.height - 100);
    let startX = _lastMouseX != null ? _lastMouseX : Math.floor(Math.random() * w) + 50;
    let startY = _lastMouseY != null ? _lastMouseY : Math.floor(Math.random() * h) + 50;
    const endX = Math.floor(Math.random() * w) + 50;
    const endY = Math.floor(Math.random() * h) + 50;
    const steps = preset.mouseStepsMin + Math.floor(Math.random() * (preset.mouseStepsMax - preset.mouseStepsMin + 1));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const jitter = (Math.random() - 0.5) * 4;
      const x = startX + t * (endX - startX) + jitter;
      const y = startY + t * (endY - startY) + (Math.random() - 0.5) * 4;
      await page.mouse.move(x, y);
      const stepMs = preset.mouseStepDelayMin + Math.floor(Math.random() * (preset.mouseStepDelayMax - preset.mouseStepDelayMin + 1));
      if (stepMs > 0) await new Promise((r) => setTimeout(r, stepMs));
    }
    _lastMouseX = endX;
    _lastMouseY = endY;
    await randomDelay(preset.mouseArrivalPauseMin, preset.mouseArrivalPauseMax);
  } catch (_) {}
}

async function randomScroll(page, config = {}) {
  try {
    await page.evaluate(() => {
      const y = 200 + Math.random() * 400;
      window.scrollBy({ top: y, behavior: 'smooth' });
    });
    const preset = getPreset(config);
    await randomDelay(preset.scrollDelayMin, preset.scrollDelayMax);
  } catch (_) {}
}

/** 【准则 v1.0】基于目标中心点的动态随机偏移点击，严禁固定坐标 */
async function clickWithOffset(page, locator) {
  const box = await locator.boundingBox().catch(() => null);
  if (!box) return locator.click({ force: true });
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = (Math.random() - 0.5) * 12;
  const dy = (Math.random() - 0.5) * 12;
  await page.mouse.click(cx + dx, cy + dy);
}

module.exports = { randomDelay, humanDelay, listDelay, listDelayMs, getRandomUserAgent, randomMouseMove, randomScroll, clickWithOffset, getPreset, NOVICE, SKILLED };
