<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import type { SampleStatus } from '$lib/landing';

	type Props = {
		status: SampleStatus;
	};

	let { status }: Props = $props();

	/* The pastel each state is drawn in, the same as the example card's chips:
	   green is good news, amber is still being decided, and grey is neither.
	   Written out in full, because Tailwind reads the class names out of this
	   file and cannot follow a name that is glued together while the page runs. */
	const TONE_CLASSES: Record<SampleStatus, string> = {
		Accepted: 'bg-success-100 text-success-700',
		Pending: 'bg-warning-100 text-warning-700',
		Waitlisted: 'bg-neutral-100 text-ink-600'
	};
</script>

<!--
	The status chip in the drawn pictures: a shadcn `Badge` as a small pill in
	the pastel of its state. Only sizing and colour classes are passed to it;
	the project's own type tokens (`text-small`) would be mistaken for colours
	by the class merger and knock the colour out.
-->
<Badge variant="secondary" class="h-auto rounded-full px-2.5 py-0.5 text-xs {TONE_CLASSES[status]}">
	{status}
</Badge>
