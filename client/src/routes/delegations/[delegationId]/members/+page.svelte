<script lang="ts">
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import Card from '$lib/components/Card.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import {
		describeMemberFailure,
		expectMemberPress,
		membersAfterPresses,
		type MemberChange,
		type MemberPress
	} from '$lib/delegation-member-presses';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import {
		NOBODY_JOINED_DESCRIPTION,
		NOBODY_JOINED_TITLE,
		INVITE_CARD_HINT,
		delegationClosedNotice,
		delegationMembersSubtitle
	} from '$lib/delegations';
	import { createInstantForm, type InstantSubmitInput } from '$lib/instant-form.svelte';
	import { joinDelegationUrl } from '$lib/urls';
	import JoinCodeCard from '../JoinCodeCard.svelte';
	import MemberRow from './MemberRow.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` in `+page.server.ts` returned together with what the
	// layout's own `load` above it returned, so the delegation, its conference and
	// the member count are all in here as well. Both run again after every action
	// on this page. `PageProps` comes from `./$types`, the types SvelteKit
	// generates for this one route.
	let { data }: PageProps = $props();

	/*
		One instant form for every row's "Make head" and "Remove"
		(`$lib/instant-form.svelte.ts`): the row changes the moment it is
		pressed, with no spinner, and a press that fails goes back with a toast.
		Without JavaScript every form posts and reloads as before.
	*/
	const memberForm = createInstantForm<MemberChange>({ describeFailure: describeFailedPress });

	/** The toast's first sentence, naming the member from the rows the page loaded. */
	function describeFailedPress(press: MemberPress): string {
		return describeMemberFailure(press, data.members);
	}

	/** What a press will change, worked out from the rows on screen at the moment of the press. */
	function expectPress(input: InstantSubmitInput): MemberChange | null {
		return expectMemberPress(input, members);
	}

	const submitMemberPress = memberForm.submitExpecting(expectPress);

	// `$derived` works each of these out again whenever `data`, or the presses
	// still on their way, change. `members` has those presses laid on top.
	const members = $derived(membersAfterPresses(data.members, memberForm.presses));
	const removedCount = $derived(data.members.length - members.length);
	const subtitle = $derived(
		delegationMembersSubtitle(data.memberCount - removedCount, data.delegation.requestedSeats)
	);
	const joinPath = $derived(joinDelegationUrl(data.delegation.joinCode));
	// `members.md` replaces the invite card with this notice once the delegation
	// is rejected or withdrawn. It is `null` while people can still join.
	const closedNotice = $derived(delegationClosedNotice(data.delegation.status));

	// `members.md` gives "Only the head" a state of its own. The reader is always
	// in the list themselves, so a list of one is a delegation nobody else has
	// joined yet. It is a `$derived` rather than another `{#if}` around the list,
	// because a third level of nesting fails `pnpm house-rules`.
	const hasNobodyElse = $derived(members.length <= 1);
</script>

<svelte:head>
	<!-- A page only this delegation's own heads can open writes its own title,
		rather than using `PageMeta`, which asks for a description for a link card. -->
	<title>Members · {data.delegation.name} · MUNMeet</title>
</svelte:head>

<!--
	One column, so the page keeps to 960px inside the shell. There is no back link
	here: the Overview tab in `+layout.svelte` above is the way back.
-->
<div class="mx-auto max-w-240">
	<div class="mb-6">
		<PageHeader title="Members" {subtitle} />
	</div>

	<div class="mb-6">
		<!-- The dashboard draws the same card one folder up, under the heading "Join code". -->
		<JoinCodeCard
			joinCode={data.delegation.joinCode}
			{joinPath}
			heading="Invite"
			hint={INVITE_CARD_HINT}
			{closedNotice}
		/>
	</div>

	<Card>
		<!-- `divide-y` draws a line between rows and none above the first one. -->
		<ul class="divide-y divide-line">
			<!--
				The `(member.userId)` key lets Svelte reuse list items instead of
				rebuilding them. Each row's buttons are decided here rather than inside
				`MemberRow`, so that the rules are all in one place: a member can be made
				a head, anybody but the reader can be removed, and only the reader's own
				head row offers "Step down".
			-->
			{#each members as member (member.userId)}
				<MemberRow
					{member}
					timezone={data.conference.timezone}
					myUserId={data.myUserId}
					isMe={member.userId === data.myUserId}
					canPromote={member.role === 'member'}
					canRemove={member.userId !== data.myUserId}
					canStepDown={member.userId === data.myUserId && member.role === 'head'}
					delegationId={data.delegation.id}
					onSubmit={submitMemberPress}
				/>
			{/each}
		</ul>

		{#if hasNobodyElse}
			<div class="mt-3">
				<EmptyState
					icon={UserPlus}
					title={NOBODY_JOINED_TITLE}
					description={NOBODY_JOINED_DESCRIPTION}
				/>
			</div>
		{/if}
	</Card>
</div>
