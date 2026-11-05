<script lang="ts">
	import { commentBodyParts } from '$lib/paper-comments';

	type Props = {
		/** What the comment says, as its writer typed it. */
		body: string;
	};

	let { body }: Props = $props();

	// The words, with each web address cut out to be drawn as a link.
	const parts = $derived(commentBodyParts(body));
</script>

<!-- `whitespace-pre-line` keeps the lines the writer broke, as they typed them. -->
<p class="mt-1 text-[0.875rem]/[1.375rem] break-words whitespace-pre-line text-foreground">
	{#each parts as part, index (index)}
		{#if part.kind === 'link'}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- a web address a writer typed, outside this site, so there is no route for `resolve()` to build -->
			<a href={part.href} class="text-link underline" rel="noopener noreferrer nofollow">
				{part.href}
			</a>
		{:else}
			{part.text}
		{/if}
	{/each}
</p>
