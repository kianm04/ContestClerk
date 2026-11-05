<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import ArrowRight from 'carbon-icons-svelte/lib/ArrowRight.svelte';
	import { Button } from '$lib/components/ui/button';

	type Props = {
		/** Straight to a new quick session when signed in, through sign up first for a visitor. */
		quickSessionHref: ResolvedPathname;
	};

	let { quickSessionHref }: Props = $props();
</script>

<!--
	The last thing in the committee-room chapter: the room on its own, for a
	club that has no conference to run. It is a white card with the landing
	page's soft shadow, the words on the left and the link on the right, and the
	link drops under the words when they need the room. Its id, `quick`, lets
	a link elsewhere point straight at it.
-->
<div
	id="quick"
	class="mt-16 flex scroll-mt-20 flex-wrap items-center justify-between gap-x-12 gap-y-5 rounded-2xl bg-surface px-7 py-6 shadow-card"
>
	<div class="min-w-0 flex-[1_1_24rem]">
		<h3 class="text-h3 text-balance text-ink-900">Try the room at your next club meeting.</h3>
		<p class="mt-1 max-w-[40rem] text-[0.875rem]/[1.375rem] text-ink-600">
			A quick session is one committee with no conference around it: a name, a list of countries and
			a speaking time. Run it from your laptop and put the display on the projector.
		</p>
	</div>

	<Button
		href={quickSessionHref}
		variant="outline"
		class="h-11 shrink-0 rounded-full border-line bg-surface px-6 text-base"
	>
		Run a quick session
		<ArrowRight aria-hidden="true" />
	</Button>
</div>
