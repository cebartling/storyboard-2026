<script lang="ts">
	import { resolve } from '$app/paths';

	let { form } = $props();
</script>

<svelte:head><title>Create an account · Storyboard 2026</title></svelte:head>

<div class="mx-auto w-full max-w-sm">
	<h1>Create an account</h1>
	<p class="text-ink-muted mt-1 text-sm">
		Your display name is what collaborators see on a shared map.
	</p>

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
			<span class="field-label">Display name</span>
			<input
				class="input"
				type="text"
				name="displayName"
				autocomplete="nickname"
				value={form?.displayName ?? ''}
				required
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class="field-label">Password</span>
			<input
				class="input"
				type="password"
				name="password"
				autocomplete="new-password"
				minlength="8"
				required
			/>
			<span class="text-ink-muted text-xs">At least 8 characters.</span>
		</label>

		<button type="submit" class="btn btn-primary">Create account</button>
	</form>

	<p class="text-ink-muted mt-4 text-sm">
		Already have an account? <a class="underline" href={resolve('/login')}>Sign in</a>.
	</p>
</div>
