import { test, expect } from '@playwright/test';

// The game ships English-first (itch.io is the storefront), while the rest of the browser
// suite runs with a zh-CN locale to keep its Chinese assertions meaningful. These tests pin
// the English surface and prove that no Chinese leaks into it.

test.describe('language selection', () => {
  test('an english browser locale gets a fully english menu', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle(/Flagship/);
    await expect(page.locator('#progress-label')).toHaveText('Cleared 0 / 6');
    await expect(page.locator('#start')).toContainText('Set Sail');
    await expect(page.locator('.intro h1')).toContainText('Six seas');
    await context.close();
  });

  test('english mode leaves no Chinese anywhere on the menu', async ({ page }) => {
    await page.goto('/?lang=en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    const text = await page.locator('#menu').innerText();
    const han = text.match(/[\u4e00-\u9fff]/g) || [];
    expect(han, `menu still shows Chinese characters:\n${text}`).toHaveLength(0);
  });

  test('english mode covers the battle HUD controls', async ({ page }) => {
    await page.goto('/?lang=en');
    await expect(page.locator('#target')).toContainText('Switch Target');
    await expect(page.locator('#boost')).toContainText('Boost');
    await expect(page.locator('#fire')).toContainText('Broadside');
    await expect(page.locator('.battle-hint')).toContainText('broadside');
    const text = await page.locator('#hud').innerText();
    const han = text.match(/[\u4e00-\u9fff]/g) || [];
    expect(han, `HUD still shows Chinese characters:\n${text}`).toHaveLength(0);
  });

  test('?lang=zh forces chinese even on an english browser', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto('/?lang=zh');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.locator('#progress-label')).toHaveText('已征服 0 / 6');
    await expect(page.locator('#start')).toContainText('起航');
    await context.close();
  });

  test('chinese and english show the same six routes', async ({ page }) => {
    await page.goto('/?lang=en');
    const english = await page.locator('#stages strong').allInnerTexts();
    await page.goto('/?lang=zh');
    const chinese = await page.locator('#stages strong').allInnerTexts();
    expect(english).toHaveLength(6);
    expect(chinese).toHaveLength(6);
    expect(english).not.toEqual(chinese);
    expect(english.join(' ')).not.toMatch(/[\u4e00-\u9fff]/);
  });
});
