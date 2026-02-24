const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..');
// 优先用环境变量：数据存硬盘时可设 SCRAPER_OUT_DIR=/Volumes/NewVolume1/mimap-scraper-out，与 link-scraper-out-to-volume 一致
const outDirEnv = process.env.SCRAPER_OUT_DIR;
const outDir = outDirEnv && path.isAbsolute(outDirEnv) ? path.resolve(outDirEnv) : path.join(projectRoot, 'scraper-out');

/** 熟练工模式：SKILLED_MODE=1 时用「每天重复操作的熟练工」参数，否则用「第一次访问的新手」参数；拟人化不删，只收紧 */
const skilledMode = process.env.SKILLED_MODE === '1' || process.env.SKILLED_MODE === 'true';

/** 允许被 flow-overrides.json 覆盖的键，用于「发现错误后改正流程」而不改代码 */
const OVERRIDABLE_KEYS = ['elementWaitMs', 'elementRetries', 'loadStateWaitMs', 'listDelayMs', 'listDelayMaxMs', 'listDelayMinFloorMs', 'minDelayMs', 'maxDelayMs'];

function loadFlowOverrides(dir) {
  const p = path.join(dir, 'flow-overrides.json');
  if (!fs.existsSync(p)) return {};
  try {
    const o = JSON.parse(fs.readFileSync(p, 'utf-8'));
    const out = {};
    for (const k of OVERRIDABLE_KEYS) if (o[k] != null) out[k] = o[k];
    return out;
  } catch (_) {
    return {};
  }
}

const defaults = {
  loginUrl: 'https://itandi-accounts.com/login?client_id=itandi_bb&redirect_uri=https%3A%2F%2Fitandibb.com%2Fitandi_accounts_callback&response_type=code&state=e04a66b4ab3dc0c4b81a829a51ec4c860c994c87249857f38f5c1f2c161cde8a',
  topUrl: 'https://itandibb.com/top',
  listUrl: 'https://itandibb.com/rent_rooms/list',
  userDataDir: path.join(projectRoot, 'pw-profile'),
  outDir,
  skilledMode,
  slowMo: skilledMode ? 0 : 50,
  loadStrategy: skilledMode ? 'domcontentloaded' : 'networkidle',
  minDelayMs: skilledMode ? 200 : 600,
  maxDelayMs: skilledMode ? 600 : 1800,
  listDelayMs: skilledMode ? 200 : 300,
  listDelayMaxMs: skilledMode ? 450 : 550,
  listDelayMinFloorMs: skilledMode ? 180 : 250,
  elementWaitMs: 45000,
  elementRetries: 4,
  loadStateWaitMs: 45000,
};

const overrides = loadFlowOverrides(outDir);
module.exports = { ...defaults, ...overrides };
