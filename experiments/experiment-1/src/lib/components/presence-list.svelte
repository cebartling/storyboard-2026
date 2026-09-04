<script lang="ts">
	import { tooltip } from '$lib/actions/tooltip';
	import { initials, participantColour } from '$lib/collab/participant-colour';
	import type { RemoteParticipant } from '$lib/collab/map-sync.svelte';

	let {
		participants,
		selfClientId
	}: {
		participants: RemoteParticipant[];
		/** This tab, so the viewer can be marked and listed first. */
		selfClientId: string;
	} = $props();

	// Self first: a list you have to search for yourself in reads as a list of
	// other people with a stranger in it.
	const ordered = $derived(
		[...participants].sort((a, b) =>
			a.clientId === selfClientId ? -1 : b.clientId === selfClientId ? 1 : 0
		)
	);
</script>

{#if ordered.length > 0}
	<ul class="flex items-center -space-x-1.5" data-testid="presence">
		{#each ordered as participant (participant.clientId)}
			{@const colour = participantColour(participant.clientId)}
			{@const isSelf = participant.clientId === selfClientId}
			<li
				class="{colour.bg} grid size-7 place-items-center rounded-full text-[0.625rem] font-semibold text-white ring-2 ring-white"
				use:tooltip={isSelf ? `${participant.displayName} (you)` : participant.displayName}
				aria-label={isSelf ? `${participant.displayName} (you)` : participant.displayName}
			>
				{initials(participant.displayName)}
			</li>
		{/each}
	</ul>
{/if}
