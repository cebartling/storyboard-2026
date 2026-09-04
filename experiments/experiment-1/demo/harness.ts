import { spawn, type ChildProcess } from 'node:child_process';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

/**
 * The bits every demo needs: a server to point at, browsers to drive, and a way
 * to narrate what is happening.
 *
 * Demos run on **Bun** — they are scripts, and Bun runs TypeScript directly. The
 * app they drive does not: `vite preview` is spawned as a child process and runs
 * under **Node**, because the app uses `better-sqlite3`, a native addon that
 * segfaults Bun on connection. Do not "simplify" that by running the server
 * under Bun; it will crash on the first request that touches the database.
 */

export const PORT = 4173;
export const BASE_URL = `http://localhost:${PORT}`;

/** Where the demo's throwaway database lives, relative to the experiment root. */
const DEMO_DB = 'demo.db';

async function portIsBusy(): Promise<boolean> {
	try {
		await fetch(BASE_URL, { signal: AbortSignal.timeout(500) });
		return true;
	} catch {
		return false;
	}
}

async function waitForServer(child: ChildProcess, timeoutMs = 120_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (child.exitCode !== null) {
			throw new Error(`The preview server exited early (code ${child.exitCode}).`);
		}
		try {
			await fetch(BASE_URL, { signal: AbortSignal.timeout(1000) });
			return;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
	}
	throw new Error(`The preview server did not answer on ${BASE_URL} within ${timeoutMs}ms.`);
}

export interface DemoServer {
	stop(): void;
}

/**
 * Builds the app and serves it against a throwaway database.
 *
 * Spawned `detached` so the whole process group can be killed: `vite preview`
 * forks, and killing only the shell leaves the server holding the port. That is
 * the failure mode worth guarding — an orphan here means the next run fails
 * confusingly, against a stale build.
 */
export async function startServer(): Promise<DemoServer> {
	if (await portIsBusy()) {
		throw new Error(
			`Something is already listening on ${BASE_URL}. ` +
				`The demo will not reuse it — it needs its own build and its own database. ` +
				`Stop it first (lsof -i :${PORT}).`
		);
	}

	console.log('Building the app…');
	const child = spawn(
		`rm -f ${DEMO_DB} ${DEMO_DB}-journal ${DEMO_DB}-wal ${DEMO_DB}-shm && vite build && vite preview`,
		{
			shell: true,
			detached: true,
			stdio: ['ignore', 'ignore', 'inherit'],
			env: { ...process.env, DATABASE_URL: DEMO_DB }
		}
	);

	let stopped = false;
	const stop = () => {
		if (stopped || child.pid === undefined) return;
		stopped = true;
		try {
			// Negative pid kills the group, not just the shell.
			process.kill(-child.pid, 'SIGTERM');
		} catch {
			// Already gone.
		}
	};

	// Covers the paths a `finally` does not: Ctrl-C, and an uncaught throw.
	const onSignal = () => {
		stop();
		process.exit(130);
	};
	process.once('SIGINT', onSignal);
	process.once('SIGTERM', onSignal);
	process.once('uncaughtException', (error) => {
		stop();
		throw error;
	});

	try {
		await waitForServer(child);
	} catch (error) {
		stop();
		throw error;
	}
	console.log(`Serving on ${BASE_URL}\n`);
	return { stop };
}

export interface DemoWindow {
	context: BrowserContext;
	page: Page;
}

/** A browser you can watch. `slowMo` is what makes the demo followable. */
export async function openBrowser(slowMo = 220): Promise<Browser> {
	return chromium.launch({ headless: false, slowMo });
}

/**
 * A window, placed where it can be seen rather than stacked on the last one.
 * Positioning goes through CDP because Playwright has no API for it.
 */
export async function openWindow(
	browser: Browser,
	bounds: { left: number; top: number; width: number; height: number }
): Promise<DemoWindow> {
	const context = await browser.newContext({
		baseURL: BASE_URL,
		viewport: { width: bounds.width - 20, height: bounds.height - 120 }
	});
	const page = await context.newPage();
	const session = await context.newCDPSession(page);
	const { windowId } = (await session.send('Browser.getWindowForTarget')) as { windowId: number };
	await session.send('Browser.setWindowBounds', { windowId, bounds });
	return { context, page };
}

export type Tone = 'info' | 'good' | 'warn';

/** A caption pinned to the top of a window, so the demo narrates itself. */
export async function say(page: Page, who: string, text: string, tone: Tone = 'info') {
	console.log(`   ${who}: ${text}`);
	await page.evaluate(
		({ who, text, tone }) => {
			const colours: Record<string, [string, string]> = {
				info: ['#1e293b', '#f8fafc'],
				good: ['#065f46', '#ecfdf5'],
				warn: ['#92400e', '#fffbeb']
			};
			const [fg, bg] = colours[tone];
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
			el.style.background = bg;
			el.style.color = fg;
			el.textContent = `${who} — ${text}`;
		},
		{ who, text, tone }
	);
}

/** A pause, so a person can read what just happened. */
export async function beat(ms = 1400) {
	await new Promise((resolve) => setTimeout(resolve, ms));
}
