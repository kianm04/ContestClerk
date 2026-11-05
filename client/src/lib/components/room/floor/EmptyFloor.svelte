<script lang="ts">
	import FloorMessage from './FloorMessage.svelte';

	type Props = {
		/** "China spoke last · 1:28", or null before anyone has spoken on the list. */
		spokeLast: string | null;
		/** Whether a present seat waits, whom the primary below calls. */
		hasWaitingSeat: boolean;
	};

	let { spokeLast, hasWaitingSeat }: Props = $props();
</script>

<!--
	The floor while nobody has it. With a present seat waiting, the primary
	below already reads "Call {seat}"; with nobody waiting, the add box beside
	it is where the chair goes next. The focus is not moved there: a key such
	as Space or N must keep working.
-->
{#if hasWaitingSeat}
	<FloorMessage title="Nobody has the floor" line={spokeLast} />
{:else}
	<FloorMessage
		title="Add the first speaker to the list"
		line="Type a delegation in the add box, then press Enter."
	/>
{/if}
