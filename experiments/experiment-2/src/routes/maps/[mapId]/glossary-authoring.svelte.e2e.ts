import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../../../e2e/auth-fixture';
import { addActivity, addStep, addStory, createMap, dialog, firstStepId } from './board-helpers';

/**
 * Creating and linking glossary entries from a selection in the story editor
 * (ADR 0025): select words in the description, then add them to the glossary
 * or link them to an existing term.
 */

const DESCRIPTION = 'Find a product by its stock unit.';

async function boardWithStory(page: Page) {
	await createMap(page, `E2E glossary authoring ${Date.now()}`);
	await addActivity(page, 'Browse');
	await addStep(page, 'Search products');
	await addStory(page, await firstStepId(page), 'unsliced', 'Search by SKU');
}

/** Opens the editor with `DESCRIPTION` typed in, and returns its textarea. */
async function editDescription(page: Page): Promise<Locator> {
	await page.getByRole('button', { name: 'Edit story Search by SKU' }).click();
	const field = dialog(page).getByLabel('Description', { exact: true });
	await field.fill(DESCRIPTION);
	return field;
}

/** Selects `words` in the textarea the way a person would, by range. */
async function select(field: Locator, words: string) {
	await field.evaluate((el, w) => {
		const area = el as HTMLTextAreaElement;
		const start = area.value.indexOf(w);
		area.focus();
		area.setSelectionRange(start, start + w.length);
		area.dispatchEvent(new Event('select'));
	}, words);
}

async function addTermOnGlossaryPage(page: Page, term: string, definition: string) {
	const boardUrl = page.url();
	await page.getByTestId('open-glossary').click();
	await page.getByLabel('New term').fill(term);
	await page.getByLabel('Definition', { exact: true }).first().fill(definition);
	await page.getByRole('button', { name: 'Add term' }).click();
	await expect(page.getByTestId('glossary-term').filter({ hasText: term })).toBeVisible();
	await page.goto(boardUrl);
}

async function saveAndHover(page: Page) {
	const editor = dialog(page);
	await editor.getByRole('button', { name: 'Save' }).click();
	await expect(editor).toBeHidden();
	await page.getByRole('button', { name: 'View story Search by SKU' }).click();
	await dialog(page).getByRole('button', { name: 'stock unit' }).hover();
	return page.locator('[data-glossary-popup]');
}

test('adds a term from a selection and links the selection to it', async ({ page }) => {
	await boardWithStory(page);
	const field = await editDescription(page);
	await select(field, 'stock unit');

	await dialog(page).getByRole('button', { name: 'Add to glossary' }).click();
	const panel = dialog(page).getByTestId('glossary-panel');
	// The term starts as the selected words; here it is changed to the acronym.
	await expect(panel.getByLabel('Term')).toHaveValue('stock unit');
	await panel.getByLabel('Term').fill('SKU');
	await panel.getByLabel('Definition').fill('Stock keeping unit');
	await panel.getByRole('button', { name: 'Add and link' }).click();

	await expect(field).toHaveValue(
		/^Find a product by its \[stock unit\]\(glossary:[0-9a-f-]+\)\.$/
	);
	// Creating the entry spent this editor's version; the story still saves.
	const popup = await saveAndHover(page);
	await expect(popup).toContainText('SKU');
	await expect(popup).toContainText('Stock keeping unit');
});

test('links a selection to an existing term', async ({ page }) => {
	await boardWithStory(page);
	await addTermOnGlossaryPage(page, 'SKU', 'Stock keeping unit');
	const field = await editDescription(page);
	await select(field, 'stock unit');

	await dialog(page).getByRole('button', { name: 'Link to glossary' }).click();
	const panel = dialog(page).getByTestId('glossary-panel');
	// The search starts as the selection, which matches nothing here.
	await expect(panel.getByText('No matching terms.')).toBeVisible();
	await panel.getByLabel('Link “stock unit” to').fill('sku');
	await panel.getByRole('button', { name: /^SKU/ }).click();

	await expect(field).toHaveValue(/\[stock unit\]\(glossary:[0-9a-f-]+\)/);
	await expect(field).toBeFocused();
	const popup = await saveAndHover(page);
	await expect(popup).toContainText('Stock keeping unit');
});

test('Escape closes the glossary panel without closing the editor', async ({ page }) => {
	await boardWithStory(page);
	const field = await editDescription(page);
	await select(field, 'stock unit');
	await dialog(page).getByRole('button', { name: 'Add to glossary' }).click();

	await page.keyboard.press('Escape');

	await expect(dialog(page).getByTestId('glossary-panel')).toHaveCount(0);
	await expect(field).toHaveValue(DESCRIPTION);
	await expect(dialog(page)).toBeVisible();
});

test('a stale editor is refused when adding a term, and keeps its text', async ({
	page,
	newUser,
	browser
}) => {
	await boardWithStory(page);
	const boardUrl = page.url();
	await page.getByTestId('share-map').click();
	const { page: other, email } = await newUser(browser);
	await dialog(page).getByLabel('Email address').fill(email);
	await dialog(page).getByRole('button', { name: 'Share' }).click();
	await expect(dialog(page)).toBeHidden();

	const field = await editDescription(page);
	// Someone else writes to the map after this editor opened.
	await other.goto(boardUrl);
	await addTermOnGlossaryPage(other, 'Basket', 'Items chosen but not yet bought');

	await select(field, 'stock unit');
	await dialog(page).getByRole('button', { name: 'Add to glossary' }).click();
	const panel = dialog(page).getByTestId('glossary-panel');
	await panel.getByLabel('Definition').fill('Stock keeping unit');
	await panel.getByRole('button', { name: 'Add and link' }).click();

	await expect(panel.getByRole('alert')).toContainText('Someone else changed this map');
	await expect(field).toHaveValue(DESCRIPTION);
});
