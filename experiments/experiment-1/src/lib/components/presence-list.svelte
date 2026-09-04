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

	// Matched against every tab the person has open, not just their first: with
	// two windows open, the second one used to fail this check and show its own
	// account as a stranger.
	const isSelf = (participant: RemoteParticipant) => participant.clientIds.includes(selfClientId);

	// Self first: a list you have to search for yourself in reads as a list of
	// other people with a stranger in it.
	const ordered = $derived([...participants].sort((a, b) => (isSelf(a) ? -1 : isSelf(b) ? 1 : 0)));
</script>

{#if ordered.length > 0}
	<ul class="flex items-center -space-x-1.5" data-testid="presence">
		{#each ordered as participant (participant.userId)}
			<!-- Coloured by person, not by tab, so someone's avatar and their
			     cursor are the same colour and stay that colour across windows. -->
			{@const colour = participantColour(participant.userId)}
			{@const self = isSelf(participant)}
			<li
				class="{colour.bg} grid size-7 place-items-center rounded-full text-[0.625rem] font-semibold text-white ring-2 ring-white"
				use:tooltip={self ? `${participant.displayName} (you)` : participant.displayName}
				aria-label={self ? `${participant.displayName} (you)` : participant.displayName}
			>
				{initials(participant.displayName)}
			</li>
		{/each}
	</ul>
{/if}
