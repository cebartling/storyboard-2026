<script lang="ts">
	import { resolve } from '$app/paths';
	import { STORY_STATUS_PRESENTATION } from '$lib/board/story-status';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const count = $derived(data.release.stories.length);
</script>

<svelte:head><title>{data.release.name} · {data.mapName} · Storyboard 2026</title></svelte:head>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
	<div>
		<a
			href={resolve('/maps/[mapId]', { mapId: data.mapId })}
			class="text-ink-muted hover:text-brand inline-flex items-center gap-1 text-sm"
			data-testid="back-to-board"
		>
			<ArrowLeft class="size-3.5" />
			{data.mapName}
		</a>
		<h1 class="mt-2">{data.release.name}</h1>
		<p class="text-ink-muted mt-1 text-sm">
			{count} stor{count === 1 ? 'y' : 'ies'}, in dependency order
		</p>
	</div>

	{#if count === 0}
		<div class="panel text-ink-muted border-dashed px-6 py-10 text-center text-sm">
			No stories in this slice yet.
		</div>
	{:else}
		<ol class="panel divide-line divide-y overflow-hidden" data-testid="release-stories">
			{#each data.release.stories as story, i (story.id)}
				{@const status = STORY_STATUS_PRESENTATION[story.status]}
				<li class="flex gap-4 px-5 py-3.5" data-testid="release-story-{story.id}">
					<span class="text-ink-muted w-6 shrink-0 text-right text-sm tabular-nums">{i + 1}.</span>
					<div class="flex min-w-0 flex-1 flex-col gap-1">
						<div class="flex items-start justify-between gap-2">
							<span
								class="text-ink min-w-0 text-sm font-medium break-words"
								data-testid="release-story-title">{story.title}</span
							>
							<span class={status.chip}>{status.label}</span>
						</div>
						<p class="text-ink-muted text-xs">{story.activityName} › {story.stepName}</p>
						{#if story.blockers.length > 0}
							<!-- Unlabelled: each item already starts "Blocked by", and a label
							     would make a screen reader say it twice. -->
							<ul class="flex flex-col gap-0.5 text-xs">
								{#each story.blockers as blocker (blocker.id)}
									{#if blocker.kind === 'inSlice'}
										<li class="text-ink-muted">Blocked by #{blocker.position} {blocker.title}</li>
									{:else if blocker.contradicts}
										<!-- Text carries the warning, not only colour (WCAG 1.4.1). -->
										<li
											class="text-danger inline-flex items-center gap-1 font-medium"
											data-testid="contradicting-blocker"
										>
											<TriangleAlert class="size-3.5 shrink-0" />
											Blocked by {blocker.title} ({blocker.sliceName ?? 'Unsliced'}), which is
											planned after this release
										</li>
									{:else}
										<li class="text-ink-muted">
											Blocked by {blocker.title} ({blocker.sliceName})
										</li>
									{/if}
								{/each}
							</ul>
						{/if}
					</div>
				</li>
			{/each}
		</ol>
	{/if}
</div>
