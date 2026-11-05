<script lang="ts">
	import Armchair from '@lucide/svelte/icons/armchair';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PersonRow from '$lib/components/PersonRow.svelte';
	import { formatDateRange } from '$lib/dates';
	import { delegationSeatCounts } from '$lib/delegation-review';
	import {
		describeSeatFailure,
		expectSeatPress,
		seatsAfterPresses,
		type SeatAssignment
	} from '$lib/delegation-seat-presses';
	import {
		NO_SEATS_ALLOCATED_TITLE,
		delegationProgress,
		delegationSeatsNotice,
		delegationSeatsSentence,
		noSeatsAllocatedDescription,
		tooFewSeatsWarning
	} from '$lib/delegations';
	import { createInstantForm, type InstantSubmitInput } from '$lib/instant-form.svelte';
	import { statusLabel } from '$lib/status';
	import CommitteeSeatGroup from './CommitteeSeatGroup.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` in `+page.server.ts` returned together with what the
	// layout's own `load` above it returned, so the delegation, its conference
	// and the two seat counts are all in here as well. Both run again after
	// every action on this page. `PageProps` comes from `./$types`, the types
	// SvelteKit generates for this one route.
	let { data }: PageProps = $props();

	/*
		One instant form for every seat's "Assign" and "Unassign"
		(`$lib/instant-form.svelte.ts`): the seat fills or empties the moment it
		is pressed, with no spinner, and a press that fails goes back with a
		toast. Without JavaScript every form posts and reloads as before.
	*/
	const seatForm = createInstantForm<SeatAssignment>({ describeFailure: describeSeatFailure });

	/** Who the seat will hold, from the members shown without a seat at the moment of the press. */
	function expectPress(input: InstantSubmitInput): SeatAssignment | null {
		return expectSeatPress(input, shown.unseatedMembers);
	}

	const submitSeatPress = seatForm.submitExpecting(expectPress);

	// `$derived` works each of these out again whenever `data`, or the presses
	// still on their way, change. `shown` is the seats with those presses laid on top.
	const shown = $derived(
		seatsAfterPresses(
			{ groups: data.groups, unseatedMembers: data.unseatedMembers },
			seatForm.presses
		)
	);
	const seatCounts = $derived(delegationSeatCounts(shown.groups));
	const progress = $derived(delegationProgress(data.delegation, seatCounts));
	const headline = $derived(delegationSeatsSentence(progress, shown.unseatedMembers.length));

	// One day written the way every other page writes a date, by asking for a
	// range that starts and ends on the same day.
	const startDay = $derived(formatDateRange(data.conference.startDate, data.conference.startDate));
	const notice = $derived(delegationSeatsNotice(progress, data.canChangeSeats, startDay));
	const tooFewSeats = $derived(tooFewSeatsWarning(progress, shown.unseatedMembers.length));

	// `seats.md` gives "No allocated seats" a state of its own, and the whole page
	// is that one message: a head with nothing allocated has nothing to be told
	// about a deadline, and everybody in the delegation is unseated, so a list of
	// them under "Members without a seat" would only repeat the membership list.
	// These two are `$derived` rather than another `{#if}` around the markup
	// because a third level of nesting fails `pnpm house-rules`.
	const hasAllocatedSeats = $derived(shown.groups.length > 0);
	const showsUnseatedMembers = $derived(hasAllocatedSeats && shown.unseatedMembers.length > 0);
</script>

<svelte:head>
	<!-- A page only this delegation's own heads can open writes its own title,
		rather than using `PageMeta`, which asks for a description for a link card. -->
	<title>Seats · {data.delegation.name} · MUNMeet</title>
</svelte:head>

<!-- One column, so the page keeps to 960px inside the shell. -->
<div class="mx-auto max-w-240">
	<div class="mb-6">
		<PageHeader title="Seats" subtitle={headline} />
	</div>

	{#if hasAllocatedSeats}
		<div class="mb-6">
			<Notice tone={notice.tone}>{notice.message}</Notice>
		</div>

		<div class="grid gap-6">
			<!-- The `(group.committee.id)` key lets Svelte reuse each card instead of rebuilding it. -->
			{#each shown.groups as group (group.committee.id)}
				<CommitteeSeatGroup
					delegationId={data.delegation.id}
					committee={group.committee}
					seats={group.seats}
					unseatedMembers={shown.unseatedMembers}
					myUserId={data.myUserId}
					canChangeSeats={data.canChangeSeats}
					onSubmit={submitSeatPress}
				/>
			{/each}
		</div>
	{:else}
		<EmptyState
			icon={Armchair}
			title={NO_SEATS_ALLOCATED_TITLE}
			description={noSeatsAllocatedDescription(data.delegation.status)}
		/>
	{/if}

	{#if showsUnseatedMembers}
		<div class="mt-6">
			<Card>
				<h2 class="font-display text-h2 text-brand-900">Members without a seat</h2>

				<ul class="mt-2">
					{#each shown.unseatedMembers as member (member.userId)}
						<li>
							<PersonRow
								name={member.fullName}
								subtitle={statusLabel('experience_level', member.experienceLevel)}
								imagePath={member.avatarPath}
							/>
						</li>
					{/each}
				</ul>

				{#if tooFewSeats}
					<div class="mt-3">
						<Notice tone="warning">{tooFewSeats}</Notice>
					</div>
				{/if}
			</Card>
		</div>
	{/if}
</div>
