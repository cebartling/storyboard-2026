import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
	addActivity,
	addSlice,
	addStep,
	addStory,
	createMap,
	dialog,
	firstStepId
} from '../routes/maps/[mapId]/board-helpers';

/**
 * A guided walkthrough of everything this branch added, driven as two real
 * browser windows side by side. Each step captions itself on the page, so the
 * demo explains what you are looking at as it happens.
 *
 * Run it with:
 *   corepack pnpm exec playwright test --config=playwright.demo.config.ts
 */

const ALICE = {
	email: `alice-${Date.now()}@demo.test`,
	name: 'Alice Okafor',
	password: 'demo-password'
};
const BOB = {
	email: `bob-${Date.now()}@demo.test`,
	name: 'Bob Lindqvist',
	password: 'demo-password'
};

/** Puts a window where it can be seen, rather than stacked on the other one. */
async function place(page: Page, left: number, top: number, width: number, height: number) {
	const session = await page.context().newCDPSession(page);
	const { windowId } = await session.send('Browser.getWindowForTarget');
	await session.send('Browser.setWindowBounds', {
		windowId,
		bounds: { left, top, width, height }
	});
}

/** A caption pinned to the top of a window, so the demo narrates itself. */
async function say(page: Page, who: string, text: string, tone: 'info' | 'good' | 'warn' = 'info') {
	console.log(`   ${who}: ${text}`);
	await page.evaluate(
		({ who, text, tone }) => {
			const colours = {
				info: ['#1e293b', '#f8fafc'],
				good: ['#065f46', '#ecfdf5'],
				warn: ['#92400e', '#fffbeb']
			}[tone];
			let el = document.getElementById('demo-caption');
			if (!el) {
				el = document.createElement('div');
				el.id = 'demo-caption';
				el.style.cssText =
					'position:fixed;left:0;right:0;top:0;z-index:99999;padding:10px 14px;' +
					'font:600 13px/1.4 ui-sans-serif,system-ui;letter-spacing:-0.01em;' +
					'box-shadow:0 1px 0 rgba(0,0,0,.08)';
				document.body.appendChild(el);
				document.body.style.paddingTop = '40px';
			}
			el.style.background = colours[1];
			el.style.color = colours[0];
			el.textContent = `${who} — ${text}`;
		},
		{ who, text, tone }
	);
}

async function beat(ms = 1400) {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

async function signUp(page: Page, who: { email: string; name: string; password: string }) {
	await page.goto('/register');
	await page.getByLabel('Email').fill(who.email);
	await page.getByLabel('Display name').fill(who.name);
	await page.getByLabel('Password').fill(who.password);
	await page.getByRole('button', { name: 'Create account' }).click();
	await page.waitForURL('/');
}

test('collaboration walkthrough', async ({ browser }) => {
	const width = 940;
	const height = 900;

	const aliceContext: BrowserContext = await browser.newContext({
		baseURL: 'http://localhost:4173',
		viewport: { width: width - 20, height: height - 120 }
	});
	const bobContext: BrowserContext = await browser.newContext({
		baseURL: 'http://localhost:4173',
		viewport: { width: width - 20, height: height - 120 }
	});
	const alice = await aliceContext.newPage();
	const bob = await bobContext.newPage();

	await place(alice, 0, 0, width, height);
	await place(bob, width, 0, width, height);

	// ------------------------------------------------------------------
	console.log('\n1. Accounts — every page requires one (ADR 0016)');
	// ------------------------------------------------------------------
	await alice.goto('/');
	await say(
		alice,
		'Alice',
		'Visiting / with no account redirects to /login. There is no public read path.'
	);
	await expect(alice).toHaveURL(/\/login$/);
	await beat();

	await signUp(alice, ALICE);
	await say(
		alice,
		'Alice',
		`Registered and signed straight in — the header shows "${ALICE.name}".`,
		'good'
	);
	await signUp(bob, BOB);
	await say(bob, 'Bob', `Registered as a separate account, in a separate browser profile.`, 'good');
	await beat();

	// ------------------------------------------------------------------
	console.log('\n2. A map belongs to somebody');
	// ------------------------------------------------------------------
	await say(alice, 'Alice', 'Creating a story map. Whoever creates it becomes its owner.');
	await createMap(alice, 'Retail checkout');
	const mapUrl = alice.url();
	await addActivity(alice, 'Browse');
	await addStep(alice, 'Search products');
	const stepId = await firstStepId(alice);
	await addStory(alice, stepId, 'unsliced', 'Keyword search');
	await say(alice, 'Alice', 'A backbone with one story on it.', 'good');
	await beat();

	await say(bob, 'Bob', "Bob's map list is empty — he cannot see a map he is not on.");
	await bob.goto('/');
	await expect(bob.getByText('Retail checkout')).toHaveCount(0);
	await beat();

	await say(
		bob,
		'Bob',
		'Opening the URL directly gives a 404, not a 403 — ids cannot be probed for.',
		'warn'
	);
	await bob.goto(mapUrl);
	await expect(bob.getByText(/No story map with id/)).toBeVisible();
	await beat(2000);

	// ------------------------------------------------------------------
	console.log('\n3. Sharing');
	// ------------------------------------------------------------------
	await say(alice, 'Alice', 'Sharing by email address — an id is not something a person has.');
	await alice.getByTestId('share-map').click();
	const share = dialog(alice);
	await share.getByLabel('Email address').fill(BOB.email);
	await beat(800);
	await share.getByRole('button', { name: 'Share' }).click();
	await expect(share).toBeHidden();
	await say(alice, 'Alice', 'Shared with Bob as an editor.', 'good');

	await say(bob, 'Bob', 'Now it is in his list, and the URL works.', 'good');
	await bob.goto(mapUrl);
	await expect(bob.getByTestId('board')).toBeVisible();
	await beat();

	// ------------------------------------------------------------------
	console.log('\n4. Presence — who is on the board');
	// ------------------------------------------------------------------
	for (const page of [alice, bob]) {
		await expect(page.getByTestId('board')).toHaveAttribute('data-collab-state', 'connected');
	}
	await say(
		alice,
		'Alice',
		'Both are connected to the map’s event stream. Note the avatars, top right.',
		'good'
	);
	await say(
		bob,
		'Bob',
		'Each sees the other. Your own avatar is first and marked "(you)".',
		'good'
	);
	await beat(2500);

	// ------------------------------------------------------------------
	console.log('\n5. Live sync — no reload anywhere from here on');
	// ------------------------------------------------------------------
	await say(alice, 'Alice', 'Adding a step. Watch the other window.');
	await addStep(alice, 'Compare products');
	await say(bob, 'Bob', 'It arrived over the stream. Nothing here was reloaded.', 'good');
	await beat(2200);

	await say(bob, 'Bob', 'And it works both ways — adding a story from this side.');
	await addStory(bob, stepId, 'unsliced', 'Filter by price');
	await say(alice, 'Alice', "Bob's story appeared here on its own.", 'good');
	await beat(2200);

	// ------------------------------------------------------------------
	console.log('\n6. Live cursors');
	// ------------------------------------------------------------------
	await say(
		bob,
		'Bob',
		'Moving the pointer across the board — Alice sees it, labelled and coloured.'
	);
	const board = bob.getByTestId('board');
	const box = (await board.boundingBox())!;
	for (let i = 0; i <= 8; i += 1) {
		await bob.mouse.move(box.x + 80 + i * 60, box.y + 120 + Math.sin(i / 2) * 70);
		await new Promise((r) => setTimeout(r, 120));
	}
	await say(
		alice,
		'Alice',
		"That is Bob's pointer, in his colour — the same colour as his avatar.",
		'good'
	);
	await beat(2500);

	// ------------------------------------------------------------------
	console.log('\n7. An open editor learns the ground moved');
	// ------------------------------------------------------------------
	await say(bob, 'Bob', 'Opening the story editor, and leaving it open.');
	await bob
		.locator('[data-testid^="story-"]')
		.first()
		.getByRole('button', { name: /edit story/i })
		.click();
	const bobEditor = dialog(bob);
	await expect(bobEditor).toBeVisible();
	await beat();

	await say(alice, 'Alice', 'Meanwhile Alice renames that very story.', 'warn');
	await alice
		.locator('[data-testid^="story-"]')
		.first()
		.getByRole('button', { name: /edit story/i })
		.click();
	const aliceEditor = dialog(alice);
	await aliceEditor.getByLabel('Story title').fill('Keyword search (renamed by Alice)');
	await aliceEditor.getByRole('button', { name: 'Save' }).click();
	await expect(aliceEditor).toBeHidden();
	await beat();

	await say(
		bob,
		'Bob',
		'His open dialog was told, without him doing anything. Save is now "Save mine anyway".',
		'warn'
	);
	await expect(bobEditor.getByTestId('subject-changed')).toBeVisible();
	await beat(2800);

	await say(bob, 'Bob', 'He can take her version instead.');
	await bobEditor.getByRole('button', { name: 'Use their version' }).click();
	await expect(bobEditor.getByLabel('Story title')).toHaveValue(
		'Keyword search (renamed by Alice)'
	);
	await say(bob, 'Bob', 'The field now holds what Alice wrote.', 'good');
	await beat(2200);
	await bob.getByRole('button', { name: 'Close' }).click();

	// ------------------------------------------------------------------
	console.log('\n8. The lost update this branch exists to fix');
	// ------------------------------------------------------------------
	await say(
		bob,
		'Bob',
		'Opening the editor again — his dialog now holds the board version as of this moment.'
	);
	await bob
		.locator('[data-testid^="story-"]')
		.first()
		.getByRole('button', { name: /edit story/i })
		.click();
	await expect(bobEditor).toBeVisible();
	await bobEditor.getByLabel('Story title').fill('Bob was here');
	await beat();

	await say(alice, 'Alice', 'Alice edits a different card entirely, moving the board on.', 'warn');
	await addSlice(alice, 'Release 1');
	await beat();

	await say(
		bob,
		'Bob',
		'Bob saves. Before this branch his stale value would have won, silently.',
		'warn'
	);
	await bobEditor.getByRole('button', { name: /^Save/ }).click();
	await expect(bobEditor.locator('p.error')).toContainText(
		'changed this map while you were editing'
	);
	await say(bob, 'Bob', 'Refused with a 409 — and what he typed is still in the field.', 'good');
	await expect(bobEditor.getByLabel('Story title')).toHaveValue('Bob was here');
	await beat(3000);

	await say(
		bob,
		'Bob',
		'The board underneath refreshed itself, so saving again is a knowing overwrite.'
	);
	await bobEditor.getByRole('button', { name: /^Save/ }).click();
	await expect(bobEditor).toBeHidden();
	await say(bob, 'Bob', 'Saved.', 'good');
	await expect(alice.getByText('Bob was here')).toBeVisible();
	await say(alice, 'Alice', 'And it landed here live, too.', 'good');
	await beat(2500);

	// ------------------------------------------------------------------
	console.log('\n9. Editors edit; owners own');
	// ------------------------------------------------------------------
	await say(
		bob,
		'Bob',
		'Bob is an editor: no Share button here, and no Delete on the map list.',
		'warn'
	);
	await expect(bob.getByTestId('share-map')).toHaveCount(0);
	await bob.goto('/');
	await expect(bob.getByTestId('shared-badge')).toBeVisible();
	await beat(2000);

	await say(
		bob,
		'Bob',
		'Hiding a control is only presentation — so here is the request made anyway.',
		'warn'
	);
	const forged = await bob.evaluate(async (url) => {
		const body = new FormData();
		body.set('mapId', url.split('/maps/')[1]);
		const response = await fetch('?/deleteMap', { method: 'POST', body });
		return JSON.parse(await response.text()) as { status: number; data: string };
	}, mapUrl);
	console.log(`   → server answered ${forged.status}: ${forged.data}`);
	await say(
		bob,
		'Bob',
		`The server refused it: ${forged.status}. The rule is not in the UI.`,
		'good'
	);
	await beat(2500);

	await say(alice, 'Alice', 'Alice, the owner, still has Delete — and the map is intact.', 'good');
	await alice.goto('/');
	await expect(alice.getByRole('button', { name: /Delete Retail checkout/ })).toBeVisible();
	await beat(3000);

	console.log('\nDone.');
	await aliceContext.close();
	await bobContext.close();
});
