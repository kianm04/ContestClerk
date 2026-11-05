<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { COMMITTEE_CHIPS_SHOWN, committeeChips, committeeChipTone } from '$lib/conferences';

	type Props = {
		/** Every committee of the conference, in the order the card names them. */
		committeeNames: string[];
		/** The conference's id, which picks the chips' colour. */
		conferenceId: string;
	};

	let { committeeNames, conferenceId }: Props = $props();

	// The first two committees by name, then "+6" for the rest.
	const chips = $derived(committeeChips(committeeNames));

	/* Written out in full, because Tailwind reads the class names out of this
	   file and cannot follow a name that is glued together while the page runs. */
	const TONE_CLASSES = {
		violet: 'bg-violet-100 text-violet-700',
		green: 'bg-success-100 text-success-700',
		blue: 'bg-brand-50 text-brand-700'
	};

	const toneClass = $derived(TONE_CLASSES[committeeChipTone(conferenceId)]);

	/** The "+6" chip after the names is grey, as in the mockup; the names are in colour. */
	function chipClass(index: number): string {
		const isRestCount = index >= COMMITTEE_CHIPS_SHOWN;

		return isRestCount ? 'bg-neutral-100 text-ink-600' : toneClass;
	}
</script>

<!--
	The committees at the foot of a conference card, after the mockup (Trello
	WMcXfry0): shadcn `Badge`s at the mockup's size and in its pastels. Only
	size and colour classes are passed to a badge; the project's own type tokens
	(`text-small`) would be mistaken for colours by its class merger and knock
	the colour out. A row of chips rather than a `<ul>`: the card already sits
	in a list, and a list inside each item would be read out as one more list per
	card. The chips are plain strings with no id, so they are keyed by position.
-->
<div class="flex flex-wrap gap-2">
	<!-- So a screen reader says what "+6" counts. -->
	{#if chips.length > 0}<span class="sr-only">Committees:</span>{/if}
	{#each chips as chip, index (index)}
		<Badge variant="secondary" class="h-auto rounded-md px-2.5 py-0.5 text-xs {chipClass(index)}">
			{chip}
		</Badge>
	{/each}
</div>
