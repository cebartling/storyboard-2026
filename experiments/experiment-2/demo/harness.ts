import { spawn, type ChildProcess } from 'node:child_process';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { DEMO_DB, dropDatabase, setting } from '../scripts/mongo-env';

/**
 * The bits every demo needs: a server to point at, browsers to drive, and a way
 * to narrate what is happening.
 *
 * Everything runs on Node (ADR 0004): the demo itself through `tsx`, and the
 * `vite preview` server it spawns as a child process. Experiment-1 ran the demos
 * on Bun and had to keep the server on Node, because `better-sqlite3` segfaults
 * Bun; that split is gone, and so is the footgun in it.
 */

export const PORT = 4173;
export const BASE_URL = `http://localhost:${PORT}`;

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

	// Emptied before the build rather than in the command, because a database is
	// not a file to `rm`. Done here, before the server starts, so the app
	// recreates its indexes against the empty database on startup.
	const uri = setting('MONGODB_URI');
	await dropDatabase(uri, DEMO_DB);

	console.log('Building the app…');
	const child = spawn(
		// `--strictPort`: without it vite quietly takes 4174 when 4173 is busy, and
		// its stdout is ignored so nobody would see that. `waitForServer` would
		// then get an answer from whatever *is* on 4173, and the demo would run
		// against a stranger's server and database. Failing to bind is the honest
		// outcome, and the early-exit check below turns it into a clear message.
		'vite build && vite preview --strictPort',
		{
			shell: true,
			detached: true,
			stdio: ['ignore', 'ignore', 'inherit'],
			env: { ...process.env, MONGODB_URI: uri, MONGODB_DB: DEMO_DB }
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

	// Covers the paths a `finally` does not: Ctrl-C, a kill, a closed terminal,
	// and an uncaught throw.
	//
	// SIGHUP matters as much as the other two and is the one easy to forget: the
	// server is spawned `detached`, so it sits in its own session and does *not*
	// receive the terminal's hangup. Only this process does — and without a
	// handler the default disposition kills it before `stop()` runs, leaving the
	// server holding the port. Closing the terminal window is an ordinary way to
	// abandon a demo.
	const onSignal = (code: number) => () => {
		stop();
		process.exit(code);
	};
	process.once('SIGINT', onSignal(130));
	process.once('SIGTERM', onSignal(143));
	process.once('SIGHUP', onSignal(129));
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
