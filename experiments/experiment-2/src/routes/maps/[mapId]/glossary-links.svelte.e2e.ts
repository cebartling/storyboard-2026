import type { Page } from '@playwright/test';
import { expect, test } from '../../../e2e/auth-fixture';
import {
	addActivity,
	addGlossaryTerm,
	addStep,
	addStory,
	createMap,
	dialog,
	firstStepId
} from './board-helpers';

/**
 * Glossary links in a story description (ADR 0025): `[words](glossary:<id>)`
 * renders as a term a reader can hover or focus to see the entry.
 *
 * Links are written by hand in the description here, so rendering is tested
 * apart from the editor that writes them from a selected phrase
 * (`glossary-authoring.svelte.e2e.ts`).
 */

async function describeStory(page: Page, title: string, description: string) {
	await page.getByRole('button', { name: `Edit story ${title}` }).click();
	const editor = dialog(page);
	await editor.getByLabel('Description').fill(description);
	await editor.getByRole('button', { name: 'Save' }).click();
	await expect(editor).toBeHidden();
}

async function openDetail(page: Page, title: string) {
	await page.getByRole('button', { name: `View story ${title}` }).click();
	const detail = dialog(page);
	await expect(detail).toBeVisible();
	return detail;
}

function popup(page: Page) {
	return page.locator('[data-glossary-popup]');
}

/** A story whose description links "stock unit" to a SKU entry. */
async function storyLinkingSku(page: Page) {
	await createMap(page, `E2E glossary links ${Date.now()}`);
	await addActivity(page, 'Browse');
	await addStep(page, 'Search products');
	await addStory(page, await firstStepId(page), 'unsliced', 'Search by SKU');
	const id = await addGlossaryTerm(page, 'SKU', 'Stock keeping unit');
	await describeStory(page, 'Search by SKU', `Find a product by its [stock unit](glossary:${id}).`);
	return id;
}

test('shows a glossary entry when hovering a linked term', async ({ page }) => {
	await storyLinkingSku(page);
	const detail = await openDetail(page, 'Search by SKU');
	const term = detail.getByRole('button', { name: 'stock unit' });

	await term.hover();

	await expect(popup(page)).toBeVisible();
	await expect(popup(page)).toContainText('SKU');
	await expect(popup(page)).toContainText('Stock keeping unit');
	// The reader's prose, not a raw link.
	await expect(detail.getByTestId('story-description')).not.toContainText('glossary:');
});

test('shows a glossary entry on keyboard focus, and Escape closes only the popup', async ({
	page
}) => {
	await storyLinkingSku(page);
	const detail = await openDetail(page, 'Search by SKU');
	const term = detail.getByRole('button', { name: 'stock unit' });

	await term.focus();
	await expect(popup(page)).toBeVisible();
	await expect(term).toHaveAttribute('aria-description', 'SKU: Stock keeping unit');

	await page.keyboard.press('Escape');
	await expect(popup(page)).toBeHidden();
	await expect(detail).toBeVisible();

	// A second Escape is the dialog's again.
	await page.keyboard.press('Escape');
	await expect(detail).toBeHidden();
});

test('a link to a deleted entry reads as plain words', async ({ page }) => {
	await storyLinkingSku(page);
	const boardUrl = page.url();
	await page.getByTestId('open-glossary').click();
	await page.getByRole('button', { name: 'Delete SKU' }).click();
	await expect(page.getByText('No terms yet')).toBeVisible();
	await page.goto(boardUrl);

	const detail = await openDetail(page, 'Search by SKU');
	const term = detail.getByTestId('story-description').locator('.glossary-term');

	await expect(term).toHaveText('stock unit');
	await expect(term).toHaveAttribute('data-unresolved', '');
	await term.hover();
	// Give a would-be popup its show delay before asserting it never came.
	await page.waitForTimeout(300);
	await expect(popup(page)).toBeHidden();
});
