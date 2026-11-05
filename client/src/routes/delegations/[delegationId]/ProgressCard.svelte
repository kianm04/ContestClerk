<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import KeyValueList from '$lib/components/KeyValueList.svelte';

	type Props = {
		/** How many seats the head asked for. The organisers may grant fewer. */
		requested: number;
		/** How many seats the organisers have reserved for this delegation. */
		allocated: number;
		/** How many of those reserved seats already have a member in them. */
		assigned: number;
		/** How full the bar is drawn, 0 to 100. `delegationProgress` works it out. */
		percentAssigned: number;
		/**
		 * The seats page, or `null` for a member, who may not assign seats and would
		 * only be sent back here.
		 *
		 * `ResolvedPathname` is the type `resolve()` from `$app/paths` returns, so
		 * only an address built by a helper in `$lib/urls.ts` can be passed in.
		 */
		seatsHref: ResolvedPathname | null;
	};

	let { requested, allocated, assigned, percentAssigned, seatsHref }: Props = $props();

	// `$derived` builds the list again whenever one of the three numbers changes.
	const facts = $derived([
		{ label: 'Requested', value: String(requested) },
		{ label: 'Allocated', value: String(allocated) },
		{ label: 'Assigned', value: String(assigned) }
	]);
</script>

<Card>
	<h2 class="font-display text-h2 text-brand-900">Progress</h2>

	<div class="mt-4">
		<KeyValueList items={facts} />
	</div>

	<!--
		The bar. `role="progressbar"` and the three `aria-` numbers are what tell a
		screen reader what the coloured box is and how far along it has got, since
		the box itself says nothing.

		The width is an inline `style` and not a Tailwind class. Tailwind reads
		class names out of the source files before the app runs, so it cannot
		follow a width that is only known while the page is being drawn; this is
		the same reason `Badge` and `Card` write their own class lists out in full.
	-->
	<div
		class="mt-4 h-2 w-full overflow-hidden rounded-full bg-neutral-100"
		role="progressbar"
		aria-label="Seats assigned"
		aria-valuemin={0}
		aria-valuemax={100}
		aria-valuenow={percentAssigned}
	>
		<div class="h-full bg-brand-700" style="width: {percentAssigned}%"></div>
	</div>

	<!--
		The way on to the seats page, which `dashboard.md` draws beside the bar. A
		plain member has no `seatsHref`: the page turns them away, so it is not shown
		to them at all. `Button` with an `href` renders a link that looks like a
		button.
	-->
	{#if seatsHref}
		<div class="mt-4">
			<Button label="Assign members →" variant="secondary" href={seatsHref} />
		</div>
	{/if}
</Card>
