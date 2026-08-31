<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<h1>Story maps</h1>

{#if form?.error}
	<p class="error">{form.error}</p>
{/if}

{#if data.maps.length === 0}
	<p>No story maps yet.</p>
{:else}
	<ul>
		{#each data.maps as map (map.id)}
			<li><a href={resolve('/maps/[mapId]', { mapId: map.id })}>{map.name}</a></li>
		{/each}
	</ul>
{/if}

<form method="POST" action="?/createMap">
	<label for="name">New map name</label>
	<input id="name" name="name" type="text" required />
	<button type="submit">Create map</button>
</form>

<style>
	.error {
		color: darkred;
	}
</style>
