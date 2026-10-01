import type { Locator, Page } from '@playwright/test';
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
	await addGlossaryTerm(page, 'SKU', 'Stock keeping unit');
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

test('a stale editor is refused when adding a term, keeps its text, and can retry', async ({
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
	await addGlossaryTerm(other, 'Basket', 'Items chosen but not yet bought');

	await select(field, 'stock unit');
	await dialog(page).getByRole('button', { name: 'Add to glossary' }).click();
	const panel = dialog(page).getByTestId('glossary-panel');
	await panel.getByLabel('Definition').fill('Stock keeping unit');
	await panel.getByRole('button', { name: 'Add and link' }).click();

	await expect(panel.getByRole('alert')).toContainText('Someone else changed this map');
	await expect(field).toHaveValue(DESCRIPTION);

	// The refusal re-snapshots the editor, so trying again goes through.
	await panel.getByRole('button', { name: 'Add and link' }).click();
	await expect(field).toHaveValue(/\[stock unit\]\(glossary:[0-9a-f-]+\)/);
});

test('adds nothing when the selected words have moved', async ({ page }) => {
	await boardWithStory(page);
	const field = await editDescription(page);
	await select(field, 'stock unit');
	await dialog(page).getByRole('button', { name: 'Add to glossary' }).click();
	const panel = dialog(page).getByTestId('glossary-panel');
	await panel.getByLabel('Definition').fill('Stock keeping unit');
	// The description is edited while the panel is open, moving the held range.
	await field.evaluate((el) => {
		const area = el as HTMLTextAreaElement;
		area.value = `Now: ${area.value}`;
	});

	await panel.getByRole('button', { name: 'Add and link' }).click();

	await expect(panel.getByRole('alert')).toContainText('The description changed');
	// Refused before the write: the glossary is still empty, so there is
	// nothing to link to, and the entry's term is still free.
	await panel.getByRole('button', { name: 'Cancel' }).click();
	await select(field, 'stock unit');
	await expect(dialog(page).getByRole('button', { name: 'Link to glossary' })).toBeDisabled();
});
