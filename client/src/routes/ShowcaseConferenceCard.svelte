<script lang="ts">
	import Bookmark from 'carbon-icons-svelte/lib/Bookmark.svelte';
	import Calendar from 'carbon-icons-svelte/lib/Calendar.svelte';
	import Education from 'carbon-icons-svelte/lib/Education.svelte';
	import Location from 'carbon-icons-svelte/lib/Location.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
	import { SHOWCASE_CONFERENCE, type ShowcaseChipTone } from '$lib/landing-showcase';
	import { LANDING_DELEGATES_IMAGE_PATH } from '$lib/media';

	const conference = SHOWCASE_CONFERENCE;
	const levels = conference.levels.join(' · ');

	/* Written out in full, because Tailwind reads the class names out of this
	   file and cannot follow a name that is glued together while the page runs.
	   The same pastels as the committee chips on a real conference card. */
	const CHIP_TONE_CLASSES: Record<ShowcaseChipTone, string> = {
		blue: 'bg-brand-50 text-brand-700',
		green: 'bg-success-100 text-success-700',
		violet: 'bg-violet-100 text-violet-700'
	};

	/** A chip is a shadcn `Badge` at the mockup's size; only size and colour classes are passed to it. */
	const CHIP_CLASSES = 'h-auto rounded-md px-3.5 py-1.5 text-xs';
</script>

<!--
	The conference card on the left of the example, after the landing page's
	mockup (Trello RBz46aTQ). It looks like a card in the directory but is only
	a picture of one: nothing on it can be pressed, so it is built of plain
	`<div>`s and `<span>`s rather than links and buttons.

	The shell is a shadcn `Card`, drawn with the mockup's soft shadow in place
	of its ring, and without its own padding so the picture can sit close to
	the edge. The pill on the picture and the chips are shadcn `Badge`s.
-->
<Card.Root class="gap-0 rounded-2xl px-3.5 pt-2.5 pb-3.5 shadow-card ring-0">
	<!-- `relative` is what the pill and the bookmark are placed against. -->
	<div class="relative h-32 overflow-hidden rounded-xl">
		<img src={LANDING_DELEGATES_IMAGE_PATH} alt="" class="size-full object-cover object-bottom" />
		<Badge
			variant="secondary"
			class="absolute top-3 left-2.5 h-auto gap-2 rounded-full bg-success-100 px-3.5 py-1.5 text-xs text-success-700"
		>
			<span class="size-2 rounded-full bg-success-500"></span>
			Applications open
		</Badge>
		<span
			class="absolute top-3 right-3 flex size-8 items-center justify-center rounded-md bg-surface text-ink-900"
		>
			<Bookmark size={20} aria-hidden="true" />
		</span>
	</div>

	<div class="flex flex-col px-4.5 pt-2.5">
		<p class="font-display text-hero-lead font-semibold text-ink-900">{conference.name}</p>
		<p class="mt-0.5 text-small text-ink-600">{conference.organisation}</p>

		<div class="mt-1.5 flex flex-wrap gap-x-7 gap-y-1 text-small text-neutral-700">
			<span class="flex items-center gap-2.5">
				<Location size={18} aria-hidden="true" />
				{conference.place}
			</span>
			<span class="flex items-center gap-2.5">
				<Calendar size={18} aria-hidden="true" />
				{conference.dates}
			</span>
			<span class="flex w-full items-center gap-2.5">
				<Education size={18} aria-hidden="true" />
				{levels}
			</span>
		</div>

		<!-- The `(committee.name)` key lets Svelte reuse each chip instead of rebuilding it. -->
		<div class="mt-2 flex flex-wrap gap-2.5">
			{#each conference.committees as committee (committee.name)}
				<Badge variant="secondary" class="{CHIP_CLASSES} {CHIP_TONE_CLASSES[committee.tone]}">
					{committee.name}
				</Badge>
			{/each}
			<Badge variant="secondary" class="{CHIP_CLASSES} bg-neutral-100 text-ink-600">
				+{conference.moreCommitteeCount}
			</Badge>
		</div>
	</div>
</Card.Root>
