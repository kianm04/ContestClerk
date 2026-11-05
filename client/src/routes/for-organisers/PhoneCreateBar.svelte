<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import ArrowRight from 'carbon-icons-svelte/lib/ArrowRight.svelte';
	import { Button } from '$lib/components/ui/button';

	type Props = {
		/** Straight to the form when signed in, through sign up first for a visitor. */
		createConferenceHref: ResolvedPathname;
	};

	let { createConferenceHref }: Props = $props();
</script>

<!--
	On a phone, "Create a conference" waits in a white bar at the bottom of the
	screen all the way down the page, as the design draws it, so the one thing
	a reader came to do is never a long scroll away. `sticky bottom-0` holds it
	to the bottom edge while the page scrolls under it, and it settles above
	the footer at the end. From `md` (768px) up the page is short enough
	between buttons that it is left out.
-->
<div class="sticky bottom-0 z-20 border-t border-line bg-surface px-4 py-3 md:hidden">
	<Button href={createConferenceHref} class="h-11 w-full rounded-full text-base">
		Create a conference
		<ArrowRight aria-hidden="true" />
	</Button>
</div>
