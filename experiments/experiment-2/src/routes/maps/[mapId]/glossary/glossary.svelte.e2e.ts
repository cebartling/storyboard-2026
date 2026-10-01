import type { Page } from '@playwright/test';
import { expect, test } from '../../../../e2e/auth-fixture';
import { createMap, dialog } from '../board-helpers';

/**
 * The map glossary page (ADR 0025): add, filter, edit and delete terms, and
 * the concurrency rules every other editor in the app already follows.
 */

async function openGlossary(page: Page) {
	await page.getByTestId('open-glossary').click();
	await expect(page.getByRole('heading', { name: 'Glossary' })).toBeVisible();
}

/** Adds a term and waits for its row, which only appears on success. */
async function addTerm(page: Page, term: string, definition: string) {
	await page.getByLabel('New term').fill(term);
	await page.getByLabel('Definition', { exact: true }).fill(definition);
	await page.getByRole('button', { name: 'Add term' }).click();
	await expect(page.getByTestId('glossary-term').filter({ hasText: term })).toBeVisible();
	await expect(page.getByLabel('New term')).toHaveValue('');
}

function terms(page: Page) {
	return page.getByTestId('glossary-term');
}

test('adds, filters, edits and deletes glossary terms', async ({ page }) => {
	await createMap(page, `E2E glossary ${Date.now()}`);
	await openGlossary(page);
	await expect(page.getByText('No terms yet')).toBeVisible();

	await addTerm(page, 'SKU', 'Stock keeping unit');
	await addTerm(page, 'Basket', 'Items a shopper has chosen but not bought');

	// Sorted by term, not by when it was added.
	await expect(terms(page)).toHaveText(['Basket', 'SKU']);

	// Filtering matches definitions as well as terms.
	const filter = page.getByTestId('glossary-filter');
	await filter.fill('shopper');
	await expect(terms(page)).toHaveText(['Basket']);
	await filter.fill('nothing like this');
	await expect(page.getByTestId('glossary-no-match')).toBeVisible();
	await filter.fill('');
	await expect(terms(page)).toHaveCount(2);

	await page.getByRole('button', { name: 'Edit SKU' }).click();
	await page
		.getByLabel('Definition', { exact: true })
		.last()
		.fill('The code a product is stocked under');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('The code a product is stocked under')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);

	await page.getByRole('button', { name: 'Delete Basket' }).click();
	await expect(terms(page)).toHaveText(['SKU']);

	// The edit survived a reload, so it was written, not just rendered.
	await page.reload();
	await expect(page.getByText('The code a product is stocked under')).toBeVisible();
});

test('refuses a term already in the glossary and keeps what was typed', async ({ page }) => {
	await createMap(page, `E2E glossary duplicate ${Date.now()}`);
	await openGlossary(page);
	await addTerm(page, 'SKU', 'Stock keeping unit');

	await page.getByLabel('New term').fill(' sku ');
	await page.getByLabel('Definition', { exact: true }).fill('Something else');
	await page.getByRole('button', { name: 'Add term' }).click();

	await expect(page.getByRole('alert')).toContainText('"SKU" is already in the glossary');
	await expect(page.getByLabel('New term')).toHaveValue(' sku ');
	await expect(terms(page)).toHaveCount(1);
});

test('a stale edit is refused, keeps the typed text, and saves on retry', async ({
	page,
	newUser,
	browser
}) => {
	await createMap(page, `E2E glossary stale ${Date.now()}`);
	const boardUrl = page.url();
	await page.getByTestId('share-map').click();
	const { page: other, email } = await newUser(browser);
	await dialog(page).getByLabel('Email address').fill(email);
	await dialog(page).getByRole('button', { name: 'Share' }).click();
	await expect(dialog(page)).toBeHidden();

	await openGlossary(page);
	await addTerm(page, 'SKU', 'Stock keeping unit');
	await other.goto(`${boardUrl}/glossary`);
	for (const p of [page, other]) {
		await expect(p.getByTestId('glossary')).toHaveAttribute('data-collab-state', 'connected');
	}

	// The owner opens an editor; the other editor then changes the map.
	await page.getByRole('button', { name: 'Edit SKU' }).click();
	await page.getByLabel('Definition', { exact: true }).last().fill('Mine');
	await addTerm(other, 'Basket', 'Items a shopper has chosen but not bought');

	// The owner's page refreshes live, without a reload, and the open editor
	// keeps what was typed.
	await expect(page.getByText('Basket')).toBeVisible();
	await expect(page.getByLabel('Definition', { exact: true }).last()).toHaveValue('Mine');

	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('alert')).toContainText('Someone else changed this map');
	await expect(page.getByLabel('Definition', { exact: true }).last()).toHaveValue('Mine');

	// The version was re-snapshotted, so a second Save is a knowing overwrite.
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
	await expect(other.getByText('Mine')).toBeVisible();
});

test("a non-member gets a 404 for another person's glossary", async ({
	page,
	newUser,
	browser
}) => {
	await createMap(page, `E2E glossary private ${Date.now()}`);
	const url = `${page.url()}/glossary`;

	const { page: outsider } = await newUser(browser);
	await outsider.goto(url);

	await expect(outsider.getByText(/No story map with id/)).toBeVisible();
});
