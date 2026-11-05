<script lang="ts">
	import Users from '@lucide/svelte/icons/users';
	import Section from '$lib/components/Section.svelte';
	import { createInstantForm } from '$lib/instant-form.svelte';
	import {
		describeMembersFailure,
		expectMembersChange,
		invitesAfterPresses,
		membersAfterPresses,
		type MembersChange
	} from '$lib/organization-member-presses';
	import {
		isOrganizationAdmin,
		memberRoleOptions,
		type InviteMemberErrors,
		type InviteMemberValues,
		type OrganizationMember,
		type OrganizationRole,
		type PendingOrganizationInvite
	} from '$lib/organizations';
	import InviteMemberForm from './InviteMemberForm.svelte';
	import MemberRow from './MemberRow.svelte';
	import PendingMemberInvites from './PendingMemberInvites.svelte';

	type Props = {
		/** Everybody in the organisation, owners first. */
		members: OrganizationMember[];
		/** The invitations nobody has accepted yet. Always empty for a plain member. */
		pendingInvites: PendingOrganizationInvite[];
		/** The organisation's name, for the questions each row asks. */
		organizationName: string;
		/** The reader's own role, which decides what they may change. */
		myRole: OrganizationRole;
		/**
		 * The moment the page was built, as an ISO string. It comes from `load`
		 * rather than from `new Date()` here, because a component that asked the
		 * clock itself would say one thing on the server and another in the
		 * browser, which Svelte reports as a hydration mismatch.
		 */
		now: string;
		/**
		 * Where this site lives, such as `https://munmeet.app`. It comes from
		 * `load`, which reads it off the request, because the boxes below hold
		 * addresses an admin copies into an email and a path on its own would be
		 * no use there.
		 */
		origin: string;
		/** What the invitation form holds: what was last typed, or empty. */
		inviteValues: InviteMemberValues;
		/** What is wrong with each of its boxes. */
		inviteErrors: InviteMemberErrors;
	};

	// `$props()` takes the values the page passed in. They arrive again, with
	// fresh contents, every time `load` runs.
	let {
		members,
		pendingInvites,
		organizationName,
		myRole,
		now,
		origin,
		inviteValues,
		inviteErrors
	}: Props = $props();

	/** The words for each role, used on a member's row and on a pending invitation. */
	const ROLE_LABELS: Record<OrganizationRole, string> = {
		owner: 'Owner',
		admin: 'Admin',
		member: 'Member'
	};

	// `$derived` asks both of these again whenever the reader's role changes,
	// which is after they have been promoted or demoted here.
	const isAdmin = $derived(isOrganizationAdmin(myRole));
	const roleOptions = $derived(memberRoleOptions(myRole));

	/*
		One instant form for every row (`$lib/instant-form.svelte.ts`): a role
		change, a removal or a revoked invitation shows the moment it is pressed,
		and a refused one goes back with a toast naming it (T142). The lists
		below are the loaded ones with the presses still on their way laid on top.
	*/
	const membersForm = createInstantForm<MembersChange>({
		describeFailure: describeMembersFailure
	});
	const submitMembersPress = membersForm.submitExpecting(expectMembersChange);
	const shownMembers = $derived(membersAfterPresses(members, membersForm.presses));
	const shownInvites = $derived(invitesAfterPresses(pendingInvites, membersForm.presses));
</script>

<Section
	title="Members"
	icon={Users}
	description="Everyone in this organisation, and who to invite."
>
	<ul class="divide-y divide-line">
		<!-- The `(member.userId)` key lets Svelte reuse rows instead of rebuilding them. -->
		{#each shownMembers as member (member.userId)}
			<li>
				<MemberRow
					{member}
					roleLabel={ROLE_LABELS[member.role]}
					{roleOptions}
					{organizationName}
					{isAdmin}
					onSubmit={submitMembersPress}
				/>
			</li>
		{/each}
	</ul>

	{#if isAdmin}
		<div class="mt-6 border-t border-line pt-6">
			<InviteMemberForm values={inviteValues} errors={inviteErrors} />
		</div>
	{/if}

	<!--
		`load` only asks for the invitations on behalf of an admin, so a plain
		member's list is empty and this whole block is left out for them. It is a
		block beside the members list rather than its `{:else}`, because an
		`{#if}` around that list would nest every row one level deeper for no
		gain; `StaffTable.svelte` is built the same way.
	-->
	{#if isAdmin}
		<PendingMemberInvites
			invites={shownInvites}
			roleLabels={ROLE_LABELS}
			{now}
			{origin}
			onRevoke={submitMembersPress}
		/>
	{/if}
</Section>
