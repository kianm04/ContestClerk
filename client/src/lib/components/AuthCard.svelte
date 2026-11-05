<script lang="ts">
	import type { Snippet } from 'svelte';
	import Card from './Card.svelte';

	type Props = {
		/** The page's one `<h1>`, in display type: "Welcome back." */
		title: string;
		/** One quiet line under it saying what the page is for. */
		subtitle?: string;
		/**
		 * The form or the message. A `Snippet` is the markup a page writes
		 * between `<AuthCard>` and `</AuthCard>`; `{@render children()}` below
		 * puts it on the screen. It is Svelte 5's replacement for the old
		 * `<slot />`.
		 */
		children: Snippet;
	};

	let { title, subtitle, children }: Props = $props();
</script>

<!--
	The box every auth page sits in: one narrow card in the middle of the page,
	full width on a phone. Five pages draw it (log in, create an account, forgot
	password, choose a new password, log out), and CLAUDE.md asks for a component
	once the same classes appear three times.
-->
<div class="mx-auto w-full max-w-md py-4 md:py-8">
	<Card>
		<h1 class="font-display text-h1-mobile text-brand-900 md:text-h1">{title}</h1>

		{#if subtitle}
			<p class="mt-1 text-body text-ink-600">{subtitle}</p>
		{/if}

		<div class="mt-6">
			{@render children()}
		</div>
	</Card>
</div>
