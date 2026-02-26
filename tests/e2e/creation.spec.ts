import { test, expect } from '@playwright/test';

test.describe('Strategy Creation', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('should open creation stage when clicking plus button', async ({ page }) => {
        const addButton = page.getByLabel('Add strategy');
        await expect(addButton).toBeVisible();
        await addButton.click();

        // Verify creation stage is visible
        const creationStage = page.locator('.create-strategy-stage');
        await expect(creationStage).toBeVisible();

        // Verify some input fields or buttons in the creation stage
        await expect(page.getByText('Decision Title')).toBeVisible();
        await expect(page.getByText('Core Properties')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Executive Summary' })).toBeVisible();
    });
});
