import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
    await page.goto('/');

    // Expect a title "to contain" a substring.
    await expect(page).toHaveTitle(/Boardroom/);
});

test('main heading is visible', async ({ page }) => {
    await page.goto('/');

    // Check if the main heading or a specific element is visible
    // Based on common nextjs/react app structure
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
});
