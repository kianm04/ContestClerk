<script lang="ts">
	import type { ProgressConnector, ProgressTone } from '$lib/application-progress';
	import { TONE_FILL_CLASSES } from '$lib/application-tone-classes';

	type Props = {
		state: ProgressConnector;
		tone: ProgressTone;
	};

	let { state, tone }: Props = $props();

	/*
		How much of the line is coloured, written out in full for Tailwind. A
		`partial` line is coloured a third of the way, the mockup's sign that the
		application is on its way to the next step but has not reached it.
	*/
	const FILL_WIDTH_CLASSES: Record<ProgressConnector, string> = {
		done: 'w-full',
		partial: 'w-1/3',
		upcoming: 'w-0'
	};
</script>

<!-- A grey line, with the coloured stretch drawn over its start. Only a picture. -->
<span aria-hidden="true" class="flex h-0.5 flex-1 bg-ink-400/60">
	<span class="h-full {FILL_WIDTH_CLASSES[state]} {TONE_FILL_CLASSES[tone]}"></span>
</span>
