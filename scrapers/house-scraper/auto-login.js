/**
 * Itandi 自动登录：在当前页（需已在登录页）用 .env 中的 ITANDI_EMAIL / ITANDI_PASSWORD 填表并提交。
 * 供 login-itandi.js 与 run.js 复用。加载 .env 时以进程 cwd 为项目根。
 */
const path = require('path');
const root = process.cwd();
require('dotenv').config({ path: path.join(root, '.env') });
if (!(process.env.ITANDI_EMAIL && process.env.ITANDI_PASSWORD)) {
  require('dotenv').config({ path: path.join(root, 'agent', '.env') });
}

async function tryAutoLogin(page) {
  const email = (process.env.ITANDI_EMAIL || '').trim();
  const password = (process.env.ITANDI_PASSWORD || '').trim();
  if (!email || !password) return false;

  try {
    // 登录页：邮箱占位符为「例) example@itandi.co.jp」，密码为「パスワード」，按钮「ログイン」
    const emailInput = page.getByPlaceholder(/例|example|itandi|メール|mail/i).first();
    await emailInput.waitFor({ state: 'visible', timeout: 15000 });
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.waitFor({ state: 'visible', timeout: 8000 });

    await emailInput.fill(email);
    await new Promise(r => setTimeout(r, 300));
    await passwordInput.fill(password);
    await new Promise(r => setTimeout(r, 500));

    const loginButton = page.getByText('ログイン').first();
    await loginButton.waitFor({ state: 'visible', timeout: 8000 });
    await loginButton.scrollIntoViewIfNeeded();
    await new Promise(r => setTimeout(r, 200));
    await loginButton.click({ force: true });

    await Promise.race([
      page.waitForURL(url => !url.includes('itandi-accounts.com/login'), { timeout: 20000 }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 22000)),
    ]).catch(() => {});

    return !page.url().includes('itandi-accounts.com/login');
  } catch (e) {
    return false;
  }
}

module.exports = { tryAutoLogin };
