<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import type { HomeLink } from '$lib/home';

	type Props = {
		/** The page's one dark-blue button, chosen by `homeHero` in `$lib/home-hero.ts` (`docs/home.md` section 4). */
		primary: HomeLink;
		/** The text link beside it, or `null` when the button already leads where it would. */
		secondary: HomeLink | null;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { primary, secondary }: Props = $props();
</script>

<!--
	The last line of the hero panel: the page's one primary button and, beside
	it, one text link, 1rem apart. The button is the manage area's `Button` as a
	link, in its dense size, so it matches the buttons on `/manage`.

	`Button` can stretch across whatever holds it (`isFullWidth`) but cannot
	change that by screen size, so the box round it does: a whole line on a
	phone, where a button is pressed with a thumb, and only as wide as its words
	from `sm` (640px) up. The link then wraps under the full-width button on a
	phone, where `min-h-11` makes it a 44px target.
-->
<div class="mt-4 flex flex-wrap items-center gap-4">
	<div class="w-full sm:w-auto">
		<Button label={primary.label} variant="primary" size="dense" href={primary.href} isFullWidth />
	</div>

	{#if secondary}
		<a
			href={secondary.href}
			class="inline-flex min-h-11 items-center text-dense font-medium text-link"
		>
			{secondary.label}
		</a>
	{/if}
</div>
