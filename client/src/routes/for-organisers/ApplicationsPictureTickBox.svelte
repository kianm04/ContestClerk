<script lang="ts">
	import Checkmark from 'carbon-icons-svelte/lib/Checkmark.svelte';

	type Props = {
		/** True draws the box filled dark blue with a white tick. */
		isTicked: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { isTicked }: Props = $props();
</script>

<!--
	A drawn tick box in the first column of the applications table. It is a
	`<span>`, not an `<input>`, because the picture is a drawing that nothing
	can press. The 3px corner is the board's, smaller than any radius token.
-->
<span class="flex justify-center">
	{#if isTicked}
		<span class="flex size-4 items-center justify-center rounded-[3px] bg-brand-900 text-surface">
			<Checkmark size={16} class="size-3" />
		</span>
	{:else}
		<span class="size-4 rounded-[3px] border border-input bg-surface"></span>
	{/if}
</span>
