import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			typescript: {
				config: (config) => {
					// `scripts/` and `demo/` are in the one program, unlike in
					// experiment-1 where they ran on Bun and had to be held in a second
					// `tsconfig.bun.json` so that `bun-types`' globals could not leak
					// into app code that runs on Node. Everything runs on Node here
					// (ADR 0004), so `pnpm check` is a single pass again.
					config.include.push('../scripts/**/*.ts', '../demo/**/*.ts');
				}
			}
		})
	],
	// `@lucide/svelte` ships uncompiled `.svelte` files (ADR 0012). `vite build`
	// bundles them, which is why the e2e suite — it runs `vite build && vite
	// preview` — never saw this; but in dev, SSR externalises the dependency and
	// Node then tries to `import` a raw `.svelte` file and throws
	// ERR_UNKNOWN_FILE_EXTENSION. Keeping it noExternal leaves it in Vite's
	// pipeline, where the Svelte plugin can compile it.
	ssr: { noExternal: ['@lucide/svelte'] },
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					// One replica set for the whole run — see `test-support/mongo.ts`.
					// Only this project needs it; the browser project never touches a
					// database.
					globalSetup: ['./src/lib/server/test-support/global-setup.ts'],
					// A replica set takes seconds to elect a primary on a cold start,
					// which is longer than Vitest's default hook timeout.
					hookTimeout: 60_000,
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
