import { test, expect } from '@playwright/test';

test.describe('Agent Config', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('should navigate to Agent Config and open modal', async ({ page }) => {
        // Navigation to Agent Config is in the header
        const agentConfigTab = page.getByRole('tab', { name: 'Agent Config' });
        await expect(agentConfigTab).toBeVisible();
        await agentConfigTab.click();

        // Verify it's active
        await expect(agentConfigTab).toHaveClass(/active/);

        // Verify Agent Config Modal components are present
        const modalContainer = page.locator('.agent-config-stage');
        await expect(modalContainer).toBeVisible();

        // Check for common agent profiles in the sidebar or header
        await expect(page.locator('.agent-config-sidebar-list')).toContainText('CEO');
        await expect(page.locator('.agent-config-sidebar-list')).toContainText('CFO');

        // Header should show whoever is selected (likely CEO by default)
        await expect(page.locator('.agent-config-editor-head')).toContainText('Persona');
    });
});
