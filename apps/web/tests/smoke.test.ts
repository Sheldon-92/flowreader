import { test, expect } from '@playwright/test';

test('homepage loads correctly', async ({ page }) => {
  await page.goto('/');
  
  // Check for FlowReader branding
  await expect(page.locator('text=FlowReader')).toBeVisible();
  
  // Check for main CTA
  await expect(page.locator('text=Start Reading Free')).toBeVisible();
  
  // Check responsive design
  await expect(page.locator('[data-testid="hero-section"]')).toBeVisible();
});

test('authentication flow', async ({ page }) => {
  await page.goto('/auth/login');
  
  // Check login form
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toBeVisible();
  
  // Check registration link
  await expect(page.locator('a[href="/auth/register"]')).toBeVisible();
});

test('library page requires authentication', async ({ page }) => {
  await page.goto('/library');
  
  // Should redirect to login
  await expect(page).toHaveURL('/auth/login');
});
EOF < /dev/null