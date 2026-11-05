<script lang="ts">
	import Calendar from 'carbon-icons-svelte/lib/Calendar.svelte';
	import Location from 'carbon-icons-svelte/lib/Location.svelte';
	import UserMultiple from 'carbon-icons-svelte/lib/UserMultiple.svelte';
	import {
		applicationWindowBadge,
		conferenceLocationLine,
		delegateCountChip,
		isAcceptingApplications,
		type Conference
	} from '$lib/conferences';
	import * as Card from '$lib/components/ui/card';
	import { statusLabel } from '$lib/status';
	import { conferenceUrl } from '$lib/urls';
	import CommitteeChips from './CommitteeChips.svelte';
	import ConferencePill from './ConferencePill.svelte';
	import ConferenceBanner from './ConferenceBanner.svelte';
	import DateRange from './DateRange.svelte';

	type Props = {
		conference: Conference;
		/**
		 * The moment the page was drawn, which decides the applications pill. It is
		 * passed in rather than read from the clock here, so the server and the
		 * browser draw the same card. `+page.server.ts` returns it.
		 */
		now: Date;
		/**
		 * What the reader is at this conference, such as "Delegate". Shown as a badge
		 * in the applications pill's place, since somebody with a role is not applying.
		 */
		role?: string;
	};

	let { conference, now, role }: Props = $props();

	/* `$derived` works each of these out again whenever the conference or `now`
	   changes, so the card never has to be told to redraw itself. */

	// "Applications open", "Closing soon", "Opens 3 Nov 2026", "Applications not
	// open yet", "Applications closed", or nothing at all.
	const applicationsPill = $derived(applicationWindowBadge(conference, now));

	// The level, with the delegates after it when the organisers have said how
	// many they expect: "University · 400+ delegates".
	const levelLabel = $derived(statusLabel('conference_level', conference.level));
	const delegatesLabel = $derived(delegateCountChip(conference.expectedDelegates));
	const levelLine = $derived(delegatesLabel ? `${levelLabel} · ${delegatesLabel}` : levelLabel);

	// Where the click leads, for a screen reader only: the mockup draws no words
	// for it, since the whole card is the link. While applications are open it names applying,
	// which is what most visitors came for. A reader with a role here is not
	// applying again.
	const destination = $derived(
		isAcceptingApplications(conference, now) && !role ? 'View and apply' : 'View conference'
	);
</script>

<!--
	The whole card is one link, so the reader can press anywhere on it. Inside
	it, a shadcn `Card` is the box: its own padding and gap are turned off so the
	banner can reach the card's edges, and its ring gives way to the mockup's
	rounder corners, hairline border and a soft shadow under the pointer.
	`h-full` stretches every card in a row to the height of the tallest. The
	card is a column, so `mt-auto` can push the chips to the bottom and every
	card in a row ends on the same line.

	`relative` on the link keeps the visually hidden words at the end inside the
	card. They are positioned absolutely, and without it they would be placed
	against the page instead, widening a phone's page when the card sits in a
	row that scrolls sideways, as on the landing page.

	The layout follows the product owner's mockup of the directory (Trello
	WMcXfry0): the pill on the picture, then the name, the organiser, three
	lines of facts and the committees.
-->
<a href={conferenceUrl(conference.slug)} class="group/link relative block h-full">
	<Card.Root
		class="h-full gap-0 rounded-2xl border border-line py-0 shadow-none ring-0 transition-shadow duration-150 group-hover/link:shadow-card"
	>
		<!-- The pill is placed over the bottom-left corner of the picture. -->
		<div class="relative">
			<ConferenceBanner {conference} aspect="listing" />

			{#if role}
				<div class="absolute bottom-3 left-3"><ConferencePill tone="brand" label={role} /></div>
			{:else if applicationsPill}
				<div class="absolute bottom-3 left-3">
					<ConferencePill tone={applicationsPill.tone} label={applicationsPill.label} />
				</div>
			{/if}
		</div>

		<Card.Content class="flex flex-1 flex-col gap-2.5 px-4 pt-3 pb-4">
			<div>
				<h3 class="line-clamp-2 font-display text-h3 text-brand-900">{conference.name}</h3>
				{#if conference.organizationName}
					<p class="text-small text-ink-600">{conference.organizationName}</p>
				{/if}
			</div>

			<!-- `items-start` keeps each icon on the first line when the words wrap. -->
			<div class="flex flex-col text-small text-ink-600">
				<p class="flex items-start gap-2">
					<Location size={16} class="mt-0.5 shrink-0" aria-hidden="true" />
					<span>{conferenceLocationLine(conference)}</span>
				</p>
				<p class="flex items-start gap-2">
					<Calendar size={16} class="mt-0.5 shrink-0" aria-hidden="true" />
					<DateRange startDate={conference.startDate} endDate={conference.endDate} />
				</p>
				<p class="flex items-start gap-2">
					<UserMultiple size={16} class="mt-0.5 shrink-0" aria-hidden="true" />
					<span>{levelLine}</span>
				</p>
			</div>

			<div class="mt-auto">
				<CommitteeChips committeeNames={conference.committeeNames} conferenceId={conference.id} />
			</div>

			<!-- `sr-only` hides these words on screen but a screen reader still reads them. -->
			<span class="sr-only">{destination}</span>
		</Card.Content>
	</Card.Root>
</a>
