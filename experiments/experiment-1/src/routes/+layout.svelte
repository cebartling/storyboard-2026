<script lang="ts">
	import { resolve } from '$app/paths';
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="flex min-h-screen flex-col">
	<header class="border-line sticky top-0 z-30 border-b bg-white/80 backdrop-blur">
		<div class="flex items-center gap-3 px-6 py-3">
			<a href={resolve('/')} class="flex items-center gap-2.5">
				<span
					class="bg-brand grid size-7 place-items-center rounded-lg text-sm font-bold text-white"
					aria-hidden="true">S</span
				>
				<span class="text-ink text-sm font-semibold tracking-tight">Storyboard 2026</span>
			</a>
			<span class="text-ink-muted hidden text-xs sm:inline">user story mapping</span>
		</div>
	</header>

	<main class="w-full flex-1 px-6 py-8">
		{@render children()}
	</main>
</div>
