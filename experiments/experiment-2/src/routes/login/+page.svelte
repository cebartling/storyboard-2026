<script lang="ts">
	import { resolve } from '$app/paths';

	let { form } = $props();
</script>

<svelte:head><title>Sign in · Storyboard 2026</title></svelte:head>

<div class="mx-auto w-full max-w-sm">
	<h1>Sign in</h1>
	<p class="text-ink-muted mt-1 text-sm">Story maps are private to the people on them.</p>

	<form method="POST" class="panel mt-6 flex flex-col gap-4 p-5">
		{#if form?.error}
			<p class="error" role="alert">{form.error}</p>
		{/if}

		<label class="flex flex-col gap-1">
			<span class="field-label">Email</span>
			<input
				class="input"
				type="email"
				name="email"
				autocomplete="username"
				value={form?.email ?? ''}
				required
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class="field-label">Password</span>
			<input
				class="input"
				type="password"
				name="password"
				autocomplete="current-password"
				required
			/>
		</label>

		<button type="submit" class="btn btn-primary">Sign in</button>
	</form>

	<p class="text-ink-muted mt-4 text-sm">
		No account? <a class="underline" href={resolve('/register')}>Create one</a>.
	</p>
</div>
