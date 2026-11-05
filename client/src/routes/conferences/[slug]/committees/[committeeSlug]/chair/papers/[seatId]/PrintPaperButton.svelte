<script lang="ts">
	import Download from '@lucide/svelte/icons/download';
	import Button from '$lib/components/Button.svelte';

	/**
	 * Opens the browser's print window. The page's print styles leave only the
	 * paper on a clean A4 page, and every browser offers "Save as PDF" there.
	 */
	function handlePrint() {
		window.print();
	}
</script>

<!--
	The button needs JavaScript, so `noscript:hidden` hides it when scripts are
	off, and the `<noscript>` note, which a browser shows only then, says how to
	do the same from the browser's own menu.
-->
<div class="noscript:hidden">
	<Button
		label="Download PDF"
		variant="secondary"
		size="sm"
		type="button"
		icon={Download}
		onclick={handlePrint}
	/>
</div>
<noscript>
	<p class="text-small text-ink-600">
		To download it, print this page from your browser's menu and choose "Save as PDF".
	</p>
</noscript>
