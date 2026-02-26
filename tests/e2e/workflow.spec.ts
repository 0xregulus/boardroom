import { test, expect } from '@playwright/test';

test.describe('Workflow Execution', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('should select a strategy and trigger workflow execution', async ({ page }) => {
        const firstCard = page.locator('.strategy-gallery-card').first();
        // Ensure the card is ready
        await expect(firstCard).toBeVisible();

        // The overlay might need a hover to be interactable or z-indexed properly
        await firstCard.hover();

        const viewReportButton = firstCard.getByRole('button', { name: 'View Report' });
        // Force click if intercepted by content
        await viewReportButton.click({ force: true });

        // Navigation should happen. We should be in Report tab by default after View Report
        const reportTab = page.getByRole('tab', { name: 'Report' });
        await reportTab.click();
        await expect(reportTab).toHaveClass(/active/);

        const workflowTab = page.getByRole('tab', { name: 'Workflow' });
        await workflowTab.click();
        await expect(workflowTab).toHaveClass(/active/);
    });
});
