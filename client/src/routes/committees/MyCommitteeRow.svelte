<script lang="ts">
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import Flag from '$lib/components/Flag.svelte';
	import {
		committeeHeading,
		myCommitteeRoleLabel,
		nextEventLine,
		type MyCommitteeConference,
		type MyCommitteeEvent,
		type MyCommitteeRole,
		type MyCommitteeSeat,
		type MyCommitteeSummary
	} from '$lib/committees';
	import { chairRoomUrl, committeeLiveUrl, committeeUrl } from '$lib/urls';

	type Props = {
		committee: MyCommitteeSummary;
		conference: MyCommitteeConference;
		role: MyCommitteeRole;
		/** The seat a delegate holds. A chair holds none. */
		seat?: MyCommitteeSeat;
		/** The next thing on this committee's own programme, when there is one. */
		nextEvent?: MyCommitteeEvent;
		/** Whether the committee is in session right now. */
		isLive: boolean;
		/** The moment the server drew the page, which "Tomorrow 10:30" is counted from. */
		now: Date;
	};

	let { committee, conference, role, seat, nextEvent, isLive, now }: Props = $props();

	// `$derived` works these out again whenever the props change. The heading is
	// the committee's short name when it has one and its full name otherwise, and
	// the event line is written in the conference's own timezone, or is `null`
	// when the committee has nothing coming up.
	const heading = $derived(committeeHeading(committee));
	const eventLine = $derived(nextEventLine(nextEvent ?? null, conference.timezone, now));
</script>

<Card>
	<!-- `min-w-0` lets the left column shrink, so a long name wraps instead of pushing the badge off the card. -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<!-- A real heading, so a screen reader can jump from committee to committee.
				The cards sit straight under the page's `<h1>`, so it is an `<h2>`. -->
			<h2 class="text-h3">
				{heading} <span class="text-ink-600">· {conference.name}</span>
			</h2>

			{#if seat}
				<p class="mt-1 flex items-center gap-2 text-body">
					{#if seat.countryCode}
						<Flag countryCode={seat.countryCode} />
					{/if}
					{seat.name}
				</p>
			{/if}
		</div>

		<Badge tone="brand" label={myCommitteeRoleLabel(role)} />
	</div>

	{#if eventLine}
		<p class="mt-2 text-small text-ink-600">{eventLine}</p>
	{/if}

	<!-- Skipped altogether when there is neither, so the card has no empty line on it. -->
	{#if committee.room || isLive}
		<div class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-ink-600">
			{#if committee.room}
				<span>{committee.room}</span>
			{/if}

			{#if isLive}
				<span class="flex items-center gap-2 text-success-700">
					<!-- The dot is decoration: the words beside it already say the committee is live. -->
					<span class="h-2 w-2 shrink-0 rounded-full bg-success-700" aria-hidden="true"></span>
					Live now
				</span>
			{/if}
		</div>
	{/if}

	<!-- A delegate follows the room from "Live view"; a chair runs it from "Chair room". -->
	<div class="mt-4 flex flex-wrap gap-3">
		<Button
			label="Open"
			variant="secondary"
			size="sm"
			href={committeeUrl(conference.slug, committee.slug)}
		/>

		{#if role === 'delegate'}
			<Button
				label="Live view"
				variant="primary"
				size="sm"
				href={committeeLiveUrl(conference.slug, committee.slug)}
			/>
		{/if}

		{#if role === 'chair'}
			<Button
				label="Chair room"
				variant="primary"
				size="sm"
				href={chairRoomUrl(conference.slug, committee.slug)}
			/>
		{/if}
	</div>
</Card>
