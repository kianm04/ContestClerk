<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import type { ProgressTone } from '$lib/application-progress';
	import { TONE_SOFT_CLASSES, TONE_TEXT_CLASSES } from '$lib/application-tone-classes';

	type Props = {
		/** "Accepted", "Under review", "Needs action" and so on. */
		label: string;
		tone: ProgressTone;
	};

	let { label, tone }: Props = $props();
</script>

<!--
	Where the application stands, as a word on the pale colour of its state:
	green accepted, amber waiting, red when the reader has to act, grey once it
	is over. A shadcn `Badge`, given the 6px corners docs/DESIGN.md asks of a
	badge and the state's colours. Only size and colour classes are passed to it:
	the project's own type tokens (`text-small`) would be mistaken for colours
	by its class merger and knock the colour out.
-->
<Badge
	variant="secondary"
	class="h-6 rounded-lg px-2 {TONE_SOFT_CLASSES[tone]} {TONE_TEXT_CLASSES[tone]}"
>
	{label}
</Badge>
