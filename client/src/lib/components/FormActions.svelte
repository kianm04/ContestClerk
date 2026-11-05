<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		/**
		 * The buttons. A `Snippet` is the markup a page writes between
		 * `<FormActions>` and `</FormActions>`; `{@render children()}` below puts
		 * it on the screen.
		 */
		children: Snippet;
	};

	let { children }: Props = $props();
</script>

<!--
	On a phone the row sticks to the bottom of the screen, so the main action of
	a long form is always in reach; from `md` up it is an ordinary row at the end
	of the form. `justify-end` puts the buttons on the right, and `flex-wrap`
	lets them fall onto a second line rather than overflow.
-->
<div
	class="sticky bottom-0 flex flex-wrap justify-end gap-3 border-t border-line bg-surface py-3 md:static md:border-0 md:bg-transparent"
>
	{@render children()}
</div>
