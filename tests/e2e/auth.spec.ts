import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should display login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Login/i);
    await expect(page.locator('button:has-text("Sign in")')).toBeVisible();
  });

  test('should navigate to dashboard after login', async ({ page, context }) => {
    // This test assumes you have test user credentials set up
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'testpassword');
    await page.click('button:has-text("Sign in")');
    
    // Wait for navigation to dashboard
    await page.waitForURL('/');
    await expect(page).toHaveTitle(/Dashboard/i);
  });

  test('should handle logout', async ({ page }) => {
    await page.goto('/');
    
    // Click user menu
    await page.click('button[data-testid="user-menu"]');
    
    // Click logout
    await page.click('button:has-text("Logout")');
    
    // Should redirect to login
    await page.waitForURL('/login');
    expect(page.url()).toContain('login');
  });
});
