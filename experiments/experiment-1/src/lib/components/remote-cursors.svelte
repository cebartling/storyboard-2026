<script lang="ts">
	import MousePointer2 from '@lucide/svelte/icons/mouse-pointer-2';
	import { participantColour } from '$lib/collab/participant-colour';
	import type { RemoteCursor } from '$lib/collab/map-sync.svelte';

	let { cursors }: { cursors: RemoteCursor[] } = $props();
</script>

<!--
	Positioned in the board's own coordinate space, as children of the world
	element. Because they live inside the zoomed, natively-scrolled world, CSS
	`zoom` and scrolling apply to them for free and no camera maths is needed
	here (ADR 0010, ADR 0015 §6).

	`pointer-events-none` throughout: a cursor must never intercept a drag.
-->
{#each cursors as cursor (cursor.clientId)}
	<!-- By person, not by tab, so this matches their avatar in the header. -->
	{@const colour = participantColour(cursor.userId)}
	<!-- `pointer-events` is inline rather than a utility class because it is a
	     correctness property, not styling: a cursor sits on top of the board, and
	     if it ever took pointer events it would swallow drags near another
	     person's pointer. That must not depend on a stylesheet being present. -->
	<div
		class="absolute z-20 flex items-start gap-1"
		style="left: {cursor.x}px; top: {cursor.y}px; pointer-events: none;"
		data-testid="remote-cursor-{cursor.clientId}"
		aria-hidden="true"
	>
		<MousePointer2 class="{colour.text} size-4 shrink-0 fill-current" />
		<span class="{colour.bg} rounded px-1.5 py-0.5 text-[0.625rem] font-medium text-white">
			{cursor.displayName}
		</span>
	</div>
{/each}
