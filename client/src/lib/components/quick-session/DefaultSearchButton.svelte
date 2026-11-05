<script lang="ts">
	/*
		With JavaScript the list already follows the search box, so a press of
		this button is stopped here and nothing is sent.
	*/
	function handleClick(event: MouseEvent) {
		event.preventDefault();
	}
</script>

<!--
	Enter in a field of a form presses the form's first submit button, which
	on these pages would otherwise be "UN members". This invisible button goes
	first instead, so Enter only searches: without JavaScript it posts to
	`?/search`, which draws the page again with only the search changed. It is
	left out of the Tab order and of what a screen reader reads, because the
	"Search" beside the box is the one to press by hand.
-->
<button
	type="submit"
	formaction="?/search"
	tabindex="-1"
	aria-hidden="true"
	onclick={handleClick}
	class="sr-only"
>
	Search
</button>
