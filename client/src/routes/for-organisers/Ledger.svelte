<script lang="ts">
	import LedgerBlocks from './LedgerBlocks.svelte';
	import LedgerTable from './LedgerTable.svelte';
</script>

<!--
	"What it replaces": seven jobs a secretariat does, what each usually runs
	on, and where it lives on MUNMeet. Unlike the drawn pictures on this page,
	this is real content: every row is a link to its chapter further down, an
	ordinary `<a href="#…">`, so it works without JavaScript.

	A desktop shows it as a table of three columns. Below `lg` there is no room
	for three, so each row becomes a block instead. Both are drawn and one is
	hidden with `hidden`, which takes it out of the page for keyboards and
	screen readers too, so nobody meets the links twice.
-->
<div class="text-ink-900">
	<div class="hidden lg:block"><LedgerTable /></div>
	<div class="lg:hidden"><LedgerBlocks /></div>

	<p class="mt-6 text-left text-body text-ink-600 lg:text-center">
		And an eighth: handing it all to next year's secretariat.
		<a href="#afterwards" class="font-medium text-brand-700 hover:underline">
			A new edition starts from the last one.
		</a>
	</p>
</div>
