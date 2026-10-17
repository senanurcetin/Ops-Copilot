import { test, expect } from '@playwright/test';

test.describe('Public login and protected-route contract', () => {
  test('shows the actual Google sign-in flow rather than a nonexistent password form', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Ops-Copilot/i);
    await expect(page.getByRole('heading', { name: 'Ops-Copilot' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'NEXUS' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });

  test('keeps the public case study reachable without Firebase credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'View public case study' }).click();
    await expect(page).toHaveURL(/\/case-study\/?$/);
  });

  test('redirects anonymous dashboard requests to the login boundary', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/');
    await expect(page).toHaveURL(/\/login\/?$/);
  });
});
