<script lang="ts">
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import Landmark from '@lucide/svelte/icons/landmark';
	import Users from '@lucide/svelte/icons/users';
	import Badge from '$lib/components/Badge.svelte';
	import ConferenceBanner from '$lib/components/ConferenceBanner.svelte';
	import DateRange from '$lib/components/DateRange.svelte';
	import Flag from '$lib/components/Flag.svelte';
	import {
		applicationWindowBadge,
		conferenceLocationLine,
		type Conference
	} from '$lib/conferences';
	import { publicMediaUrl } from '$lib/media';
	import { statusBadgeTone, statusLabel } from '$lib/status';
	import { organizationUrl } from '$lib/urls';

	type Props = {
		conference: Conference;
		/**
		 * The moment the page was drawn, which decides the applications badge. It is
		 * passed in rather than read from the clock here, so the server and the
		 * browser draw the same hero. `+page.server.ts` returns it.
		 */
		now: Date;
	};

	let { conference, now }: Props = $props();

	// `$derived` works this out again whenever the conference or `now` changes:
	// "Applications open", "Closing soon", "Opens 3 Nov 2026", "Applications not
	// open yet", "Applications closed", or nothing at all.
	const applicationsBadge = $derived(applicationWindowBadge(conference, now));
</script>

<header>
	<!-- `relative` is what the logo box positions itself against, and
		`overflow-hidden` trims the picture to the rounded corners. -->
	<div class="relative">
		<div class="overflow-hidden rounded-2xl">
			<ConferenceBanner {conference} aspect="wide" />
		</div>

		<!-- A conference nobody has given a logo shows no box here. -->
		{#if conference.logoPath}
			<img
				src={publicMediaUrl(conference.logoPath)}
				alt="{conference.name} logo"
				class="absolute -bottom-6 left-4 h-20 w-20 rounded-2xl border border-line bg-surface object-contain p-1"
			/>
		{/if}
	</div>

	<!-- The logo box hangs over the banner, so the name starts well below it.
		The name is in the Display style, not H1, because the page file draws it
		as the hero's headline. -->
	<div class="mt-8 flex flex-col gap-2">
		<h1 class="font-display text-display-mobile text-brand-900 md:text-display">
			{conference.name}
		</h1>

		{#if conference.tagline}
			<p class="text-body text-ink-600">{conference.tagline}</p>
		{/if}

		<!-- The meta row wraps onto as many lines as a phone needs. -->
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-small text-ink-600">
			<!-- A link needs the slug as much as the words need the name, and the
				`Conference` type allows either of them to be missing. -->
			{#if conference.organizationName && conference.organizationSlug}
				<a
					href={organizationUrl(conference.organizationSlug)}
					class="flex items-center gap-1.5 text-brand-700"
				>
					<Landmark size={20} strokeWidth={1.75} aria-hidden="true" />
					{conference.organizationName}
				</a>
			{/if}

			<!-- An online conference, or one with no city yet, has no country to
				fly a flag for, so only the words are shown. -->
			<span class="flex items-center gap-1.5">
				{#if conference.countryCode !== null && conference.locationMode !== 'online'}
					<Flag countryCode={conference.countryCode} />
				{/if}
				{conferenceLocationLine(conference)}
			</span>

			<span class="flex items-center gap-1.5">
				<CalendarDays size={20} strokeWidth={1.75} aria-hidden="true" />
				<DateRange startDate={conference.startDate} endDate={conference.endDate} />
			</span>

			{#if conference.expectedDelegates !== null}
				<span class="flex items-center gap-1.5">
					<Users size={20} strokeWidth={1.75} aria-hidden="true" />
					~{conference.expectedDelegates} delegates
				</span>
			{/if}
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<Badge
				tone={statusBadgeTone('conference_level', conference.level)}
				label={statusLabel('conference_level', conference.level)}
			/>

			<Badge tone="neutral" label={conference.language} />

			{#if applicationsBadge}
				<Badge tone={applicationsBadge.tone} label={applicationsBadge.label} />
			{/if}
		</div>
	</div>
</header>
