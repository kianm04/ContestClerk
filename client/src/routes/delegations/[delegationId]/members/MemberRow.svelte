<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import Badge from '$lib/components/Badge.svelte';
	import Flag from '$lib/components/Flag.svelte';
	import KeyValueList from '$lib/components/KeyValueList.svelte';
	import PersonRow from '$lib/components/PersonRow.svelte';
	import { formatDayAndMonth } from '$lib/dates';
	import {
		NO_SEAT_LABEL,
		memberDetailItems,
		memberDisplayName,
		memberRowSubtitle,
		memberSeatLabel,
		type DelegationMember
	} from '$lib/delegations';
	import MemberActions from './MemberActions.svelte';

	/*
		`members.md` lists this row's props as `member`, `seat?`, `isMe`, `canRemove`
		and `canPromote`. There is no `seat` here because the seat travels inside
		`member`: that is what `listDelegationMembers` answers. The other three are
		small things a row cannot work out on its own — the conference's timezone,
		the reader's own id and the delegation's id — and the page above has all of
		them. Which buttons a row gets is decided there too, so that the rules sit
		in one place rather than once per row.
	*/
	type Props = {
		member: DelegationMember;
		/** The conference's timezone, so the join date reads the same for everybody. */
		timezone: string;
		/** The reader's own id, so their row says "you". */
		myUserId: string;
		isMe: boolean;
		canPromote: boolean;
		canRemove: boolean;
		canStepDown: boolean;
		/** The delegation, which `MemberActions` needs for the Remove button's address. */
		delegationId: string;
		/** The page's instant form, which "Make head" and "Remove" are sent through. */
		onSubmit: SubmitFunction;
	};

	let {
		member,
		timezone,
		myUserId,
		isMe,
		canPromote,
		canRemove,
		canStepDown,
		delegationId,
		onSubmit
	}: Props = $props();

	// `$derived` works each of these out again whenever `member` changes.
	const name = $derived(memberDisplayName(member, myUserId));
	const subtitle = $derived(
		memberRowSubtitle(member, formatDayAndMonth(member.joinedAt, timezone))
	);
	const seat = $derived(member.seat);

	// The two private details a head reads about their own members, and nobody
	// else does (the `delegation_member_details` view). The list is empty for a
	// reader who may not read them, and an empty one draws no toggle at all.
	const detailItems = $derived(memberDetailItems(member.details));
</script>

<!-- The reader's own row is tinted, which is what `isMe` does beyond the "(you)"
	in the name: it finds you at a glance in a long list. -->
<li class={isMe ? 'bg-brand-50' : ''}>
	<PersonRow {name} {subtitle} imagePath={member.avatarPath} />

	<!--
		The seat and the buttons sit on a line of their own under the name, indented
		past the avatar, the way the wireframe in `members.md` draws them. They cannot
		share the name's line: a phone is 390px wide, and an avatar, a name, a flag, a
		seat and up to two buttons are wider than that, which pushed the row off the
		side of the screen. `flex-wrap` lets them fall onto a further line when even
		this one is not wide enough.
	-->
	<div class="flex flex-wrap items-center gap-2 pb-2 pl-13">
		{#if seat}
			<!-- A seat may be a role rather than a country — a rapporteur, an observer —
				and `seats.country_code` is nullable for that, so the flag is drawn only
				when there is a country. -->
			{#if seat.countryCode}
				<Flag countryCode={seat.countryCode} />
			{/if}

			<Badge tone="neutral" label={memberSeatLabel(seat)} />
		{:else}
			<span class="text-small text-ink-600">{NO_SEAT_LABEL}</span>
		{/if}

		<MemberActions {member} {canPromote} {canRemove} {canStepDown} {delegationId} {onSubmit} />
	</div>

	{#if detailItems.length > 0}
		<!--
			`<details>` and `<summary>` are the browser's own collapsible block: it
			opens and closes with no JavaScript at all, and the keyboard reaches it
			because the browser makes the summary focusable.

			`members.md` asks for the details inline on a desktop and behind a toggle on
			a phone. One toggle at every width is what we build: opening it by itself
			above a breakpoint needs either the markup twice or JavaScript watching the
			window, and a `<details>` needs neither and reads the same everywhere.
		-->
		<details class="pb-3 pl-13">
			<summary class="cursor-pointer py-2 text-small text-ink-600">Details</summary>
			<KeyValueList items={detailItems} />
		</details>
	{/if}
</li>
