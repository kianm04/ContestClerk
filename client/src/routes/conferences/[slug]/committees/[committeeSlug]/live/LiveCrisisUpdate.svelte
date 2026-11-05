<script lang="ts">
	import { crisisUpdateLabel, type CrisisUpdate } from '$lib/crisis-papers';
	import LivePanel from './LivePanel.svelte';

	type Props = {
		/** The crisis staff's latest update to the room. */
		update: CrisisUpdate;
		/** The conference's time zone, which the time it was sent is told in. */
		timeZone: string;
	};

	let { update, timeZone }: Props = $props();
</script>

<!--
	The crisis staff's latest word to a crisis committee, above the floor until
	the next one replaces it. The page puts it in a polite live region, so a
	screen reader hears a new one arrive. It keeps the lines it was sent in.
-->
<LivePanel title={crisisUpdateLabel(update, timeZone)}>
	<p class="text-[15px]/6 break-words whitespace-pre-line">{update.message}</p>
</LivePanel>
