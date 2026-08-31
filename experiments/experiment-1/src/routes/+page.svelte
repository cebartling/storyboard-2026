<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-6">
	<div>
		<h1>Story maps</h1>
		<p class="text-ink-muted mt-1 text-sm">
			Each map is a board of activities, steps, and release slices.
		</p>
	</div>

	{#if form?.error}
		<p class="error">{form.error}</p>
	{/if}

	{#if data.maps.length === 0}
		<div class="panel text-ink-muted border-dashed px-6 py-10 text-center text-sm">
			No story maps yet. Create your first one below.
		</div>
	{:else}
		<ul class="panel divide-line divide-y overflow-hidden">
			{#each data.maps as map (map.id)}
				<li>
					<a
						href={resolve('/maps/[mapId]', { mapId: map.id })}
						class="hover:bg-brand-soft group flex items-center justify-between gap-4 px-5 py-3.5 transition"
					>
						<span class="text-ink group-hover:text-brand text-sm font-medium">{map.name}</span>
						<span class="text-ink-muted group-hover:text-brand text-sm" aria-hidden="true">→</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}

	<form method="POST" action="?/createMap" class="panel flex flex-col gap-2 p-5">
		<label for="name" class="field-label">New map name</label>
		<div class="flex gap-2">
			<input
				id="name"
				name="name"
				type="text"
				required
				placeholder="e.g. Checkout redesign"
				class="input"
			/>
			<button type="submit" class="btn btn-primary">Create map</button>
		</div>
	</form>
</div>
