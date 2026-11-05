<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import type { BadgeTone } from '$lib/status';

	type Props = {
		/** The colour: `success` for open applications, `warning` for closing soon, `brand` for the reader's role. */
		tone: BadgeTone;
		/** The words. Colour is never the only signal, so a pill always says something. */
		label: string;
	};

	let { tone, label }: Props = $props();

	/* The pastel each tone is drawn in. Written out in full, because Tailwind
	   reads the class names out of this file and cannot follow a name that is
	   glued together while the page runs. */
	const TONE_CLASSES: Record<BadgeTone, string> = {
		brand: 'bg-brand-100 text-brand-900',
		success: 'bg-success-100 text-success-700',
		warning: 'bg-warning-100 text-warning-700',
		danger: 'bg-danger-100 text-danger-700',
		neutral: 'bg-neutral-100 text-neutral-700'
	};

	const toneClass = $derived(TONE_CLASSES[tone]);
</script>

<!--
	The pill over the corner of a conference card's banner: "Applications open",
	"Opens 3 Nov 2026", or the reader's role, as the mockup draws it (Trello
	WMcXfry0). A shadcn `Badge` at the mockup's size, in the pastel of its tone.
	Only size and colour classes are passed to it; the project's own type tokens
	(`text-small`) would be mistaken for colours by its class merger and knock
	the colour out.
-->
<Badge variant="secondary" class="h-auto rounded-full px-2.5 py-0.5 text-xs {toneClass}">
	{label}
</Badge>
