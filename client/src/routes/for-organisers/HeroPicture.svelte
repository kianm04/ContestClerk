<script lang="ts">
	import DelegatePhone from './DelegatePhone.svelte';
	import HeroPictureDashboard from './HeroPictureDashboard.svelte';
</script>

<!--
	The hero's picture: the secretariat's dashboard, with a delegate's phone
	hanging off its lower right corner, the two ends of the headline. It is a
	drawing of the product, so the whole of it is hidden from screen readers
	(`aria-hidden`) and the sentence before it says what it shows instead.

	The padding on the right and below is room for the phone to hang into. On a
	desktop it hangs off the corner, over the ends of the last rows, which hold
	no words. Below `md` there is no room beside the dashboard, so the phone
	stands closer in, over the space the dashboard keeps free to the right of
	its figures (see `HeroPictureFigures`).
-->
<p class="sr-only">
	A drawing of a secretariat's dashboard for Northbridge MUN 2027: 38 applications waiting for a
	decision, 12 seats asked for by a school, 2 committees without a chair and 9 unpaid invoices, with
	a delegate's phone beside it showing Kenya with the floor in the Human Rights Council.
</p>

<div aria-hidden="true" class="relative pb-12 text-ink-900 md:pr-[6.5rem] md:pb-[8.5rem]">
	<HeroPictureDashboard />

	<div class="absolute right-1 bottom-0 w-[12.5rem] md:right-0">
		<DelegatePhone showsList={false} />
	</div>
</div>
