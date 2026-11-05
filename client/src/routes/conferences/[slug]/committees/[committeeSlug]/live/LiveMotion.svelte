<script lang="ts">
	import { motionSubtitle, motionTitle } from '$lib/motion-input';
	import type { SessionMotion } from '$lib/motions';
	import LivePanel from './LivePanel.svelte';

	type Props = {
		/** The motion first in line, which the chair puts to the vote next. */
		motion: SessionMotion;
	};

	let { motion }: Props = $props();
</script>

<!--
	The motion first in line, as the chair reads it out: its kind and times,
	"Moderated caucus · 10:00 / 1:00", and under it its topic and who raised it.
-->
<LivePanel title="Motion on the floor">
	<div>
		<p class="font-medium break-words">{motionTitle(motion)}</p>
		<p class="text-small break-words text-ink-600">{motionSubtitle(motion)}</p>
	</div>
</LivePanel>
