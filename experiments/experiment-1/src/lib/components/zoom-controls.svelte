<script lang="ts">
	// Overlay control cluster for the board's Camera (ADR 0010): zoom in/out,
	// fit-to-window, reset-to-100%, and a live readout. Purely a thin view
	// over the camera's own intent methods — it owns no pan/zoom state.
	import Maximize from '@lucide/svelte/icons/maximize';
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import { tooltip } from '$lib/actions/tooltip';
	import type { Camera } from '$lib/canvas/camera.svelte';

	let { camera }: { camera: Camera } = $props();
</script>

<div
	class="border-line pointer-events-auto flex items-center gap-1 rounded-lg border bg-white/90 p-1 shadow-sm backdrop-blur"
>
	<button
		type="button"
		class="btn btn-quiet btn-icon"
		data-testid="zoom-out"
		aria-label="Zoom out"
		use:tooltip={'Zoom out'}
		aria-keyshortcuts="-"
		onclick={() => camera.zoomOut()}
	>
		<Minus class="size-4" />
	</button>
	<span
		data-testid="zoom-readout"
		aria-live="polite"
		class="text-ink-muted min-w-10 text-center text-xs font-medium tabular-nums"
	>
		{Math.round(camera.zoom * 100)}%
	</span>
	<button
		type="button"
		class="btn btn-quiet btn-icon"
		data-testid="zoom-in"
		aria-label="Zoom in"
		use:tooltip={'Zoom in'}
		aria-keyshortcuts="+"
		onclick={() => camera.zoomIn()}
	>
		<Plus class="size-4" />
	</button>
	<div class="bg-line mx-1 h-5 w-px" aria-hidden="true"></div>
	<button
		type="button"
		class="btn btn-quiet btn-icon"
		data-testid="zoom-fit"
		aria-label="Fit board to window"
		use:tooltip={'Fit board to window'}
		aria-keyshortcuts="1"
		onclick={() => camera.fit()}
	>
		<Maximize class="size-4" />
	</button>
	<button
		type="button"
		class="btn btn-quiet btn-icon"
		data-testid="zoom-reset"
		aria-label="Reset zoom to 100%"
		use:tooltip={'Reset zoom to 100%'}
		aria-keyshortcuts="0"
		onclick={() => camera.resetZoom()}
	>
		<RotateCcw class="size-4" />
	</button>
</div>
