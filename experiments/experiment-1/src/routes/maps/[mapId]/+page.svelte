<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<h1>{data.board.name}</h1>

<!-- Minimal placeholder board: real 2-axis CSS grid layout is step 7.
     This just needs to make the loaded aggregate visible/inspectable. -->
<div data-testid="board">
	{#if data.board.activities.length === 0}
		<p>No activities yet.</p>
	{/if}
	{#each data.board.activities as activity (activity.id)}
		<section data-testid="activity-{activity.id}">
			<h2>{activity.name}</h2>
			{#each activity.steps as step (step.id)}
				<div data-testid="step-{step.id}">
					<h3>{step.name}</h3>
					<ul>
						{#each step.unslicedStories as story (story.id)}
							<li data-testid="story-{story.id}">{story.title}</li>
						{/each}
					</ul>
					{#each step.storiesBySlice as bucket (bucket.sliceId)}
						{#if bucket.stories.length > 0}
							<ul data-testid="slice-{bucket.sliceId}">
								{#each bucket.stories as story (story.id)}
									<li data-testid="story-{story.id}">{story.title}</li>
								{/each}
							</ul>
						{/if}
					{/each}
				</div>
			{/each}
		</section>
	{/each}
</div>

{#if data.board.slices.length > 0}
	<h2>Slices</h2>
	<ul>
		{#each data.board.slices as slice (slice.id)}
			<li data-testid="slice-label-{slice.id}">{slice.name}</li>
		{/each}
	</ul>
{/if}
