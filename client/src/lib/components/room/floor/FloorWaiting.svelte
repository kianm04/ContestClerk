<script lang="ts">
	import type { CommitteeMode } from '$lib/committee-room';
	import { waitingFloorSentence } from '$lib/gsl-floor';
	import FloorMessage from './FloorMessage.svelte';

	type Props = {
		/** The live mode the GSL waits for: a caucus, a single speaker, a vote, or the suspension. */
		liveMode: CommitteeMode;
	};

	let { liveMode }: Props = $props();
</script>

<!--
	The GSL's floor while another mode is live or the room is suspended: no
	clock and no controls, only when the GSL comes back. The list beside it
	keeps working as always.
-->
<FloorMessage
	title={waitingFloorSentence(liveMode)}
	line="The list can still be added to and reordered."
/>
