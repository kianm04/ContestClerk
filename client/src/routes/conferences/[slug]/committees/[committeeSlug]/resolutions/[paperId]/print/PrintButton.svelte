<script lang="ts">
	import { onMount } from 'svelte';
	import Printer from 'carbon-icons-svelte/lib/Printer.svelte';
	import { Button } from '$lib/components/ui/button';

	/*
		Whether the page's script runs. `onMount` only runs in the browser, so
		without JavaScript the button is never drawn, since only a script can
		open the print dialog; the browser's own Print menu still works.
	*/
	let isScriptRunning = $state(false);
	onMount(() => {
		isScriptRunning = true;
	});

	function handlePrint() {
		window.print();
	}
</script>

<!-- "Print", the page's one filled button, left off the sheet it prints. -->
{#if isScriptRunning}
	<Button size="lg" class="shrink-0 max-lg:h-11 print:hidden" onclick={handlePrint}>
		<Printer size={16} aria-hidden="true" />
		Print
	</Button>
{/if}
