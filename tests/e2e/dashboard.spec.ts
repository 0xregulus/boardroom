import { test, expect } from '@playwright/test';

test.describe('Dashboard / Gallery', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('should load strategy cards', async ({ page }) => {
        // Wait for the strategy gallery grid to be visible
        const galleryGrid = page.getByLabel('Decision card gallery');
        await expect(galleryGrid).toBeVisible();

        // Check if at least one strategy card is present
        const cards = page.locator('.strategy-gallery-card');
        await expect(cards.first()).toBeVisible();
    });

    test('should filter strategies by sentiment', async ({ page }) => {
        // Click on "High Friction" filter
        const highFrictionFilter = page.getByRole('tab', { name: 'High Friction' });
        await highFrictionFilter.click();
        await expect(highFrictionFilter).toHaveClass(/active/);

        // Click on "Smooth Approvals" filter
        const smoothApprovalsFilter = page.getByRole('tab', { name: 'Smooth Approvals' });
        await smoothApprovalsFilter.click();
        await expect(smoothApprovalsFilter).toHaveClass(/active/);
    });

    test('should switch between Gallery and Insights views', async ({ page }) => {
        // Click on "Insights" tab
        const insightsTab = page.getByRole('tab', { name: 'Insights' });
        await insightsTab.click();
        await expect(insightsTab).toHaveClass(/active/);

        // Check if insights container is visible
        await expect(page.locator('.portfolio-insights')).toBeVisible();

        // Switch back to "Gallery"
        const galleryTab = page.getByRole('tab', { name: 'Gallery' });
        await galleryTab.click();
        await expect(galleryTab).toHaveClass(/active/);
        await expect(page.locator('.strategy-gallery-grid')).toBeVisible();
    });

    test('should select a strategy on click', async ({ page }) => {
        const firstCard = page.locator('.strategy-gallery-card').first();

        // Click the title inside the card to ensure the event reaches the handler
        await firstCard.locator('h3').click({ force: true });

        // Verify it has the selected class
        await expect(firstCard).toHaveClass(/selected/);
    });
});
