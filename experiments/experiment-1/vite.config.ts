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
					config.include.push('../drizzle.config.ts');
					// `scripts/` and `demo/` are deliberately NOT added here. They run
					// on Bun and need `bun-types`, which is a global declaration file —
					// pulling them into this program would make `Bun.*` visible to app
					// code that runs on Node, where it would typecheck and then crash.
					// They have their own program: `tsconfig.bun.json`, run by
					// `pnpm check` as a second pass.
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
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
