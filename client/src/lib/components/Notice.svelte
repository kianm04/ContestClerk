<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		tone: 'info' | 'warning' | 'error' | 'success';
		/** A bold first line. Without it the notice is one paragraph. */
		title?: string;
		/** What the notice says. */
		children: Snippet;
	};

	let { tone, title, children }: Props = $props();

	/* Written out in full so Tailwind can find the class names. */
	const TONE_CLASSES = {
		info: 'bg-brand-50 border-brand-100 text-brand-900',
		warning: 'bg-warning-100 border-warning-700 text-warning-700',
		error: 'bg-danger-100 border-danger-700 text-danger-700',
		success: 'bg-success-100 border-success-700 text-success-700'
	};

	const toneClass = $derived(TONE_CLASSES[tone]);

	/*
		`role="alert"` makes a screen reader interrupt and read a failure out
		straight away. The other tones are not urgent, so they get the quieter
		`role="status"`, which is read when the reader next pauses.
	*/
	const role = $derived(tone === 'error' ? 'alert' : 'status');
</script>

<div {role} class="rounded-control border p-3 text-body {toneClass}">
	{#if title}
		<p class="font-medium">{title}</p>
	{/if}

	{@render children()}
</div>
