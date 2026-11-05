<script lang="ts">
	import { crisisUpdateLabel, type CrisisUpdate } from '$lib/crisis-papers';

	type Props = {
		/** The crisis staff's latest update to the room. */
		update: CrisisUpdate;
		/** The conference's time zone, which the time it was sent is told in. */
		timeZone: string;
	};

	let { update, timeZone }: Props = $props();
</script>

<!--
	The crisis staff's latest word to the room, along the projector's foot
	under a rule, whatever the screen above shows. `mt-auto` pushes it to the
	bottom; a long one stops at three lines, since the projector never scrolls.
-->
<section
	aria-label="Crisis update"
	class="mt-auto flex flex-col gap-[0.6vw] border-t border-ink-900 pt-[1.4vw]"
>
	<p class="text-[1.6vw]/[1.3] text-ink-600 tabular-nums">{crisisUpdateLabel(update, timeZone)}</p>
	<p class="line-clamp-3 text-[2.4vw]/[1.3] break-words">{update.message}</p>
</section>
