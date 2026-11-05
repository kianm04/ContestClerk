<script lang="ts">
	import Users from '@lucide/svelte/icons/users';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ManageSection from '$lib/components/manage/ManageSection.svelte';
	import { createInstantForm, type InstantSubmitInput } from '$lib/instant-form.svelte';
	import {
		filterTeamPeople,
		type TeamCommittee,
		type TeamFilter,
		type TeamPerson,
		type TeamRole
	} from '$lib/team';
	import {
		describeStaffFailure,
		expectStaffChange,
		teamPeopleAfterPresses,
		type StaffChange
	} from '$lib/team-staff-presses';
	import { manageRolesUrl } from '$lib/urls';
	import StaffList from './StaffList.svelte';
	import TeamFilterForm from './TeamFilterForm.svelte';

	type Props = {
		/** Everybody on the team, whichever role the list is filtered to. */
		people: TeamPerson[];
		/** Every committee of this conference, for the row's own picker. */
		committees: TeamCommittee[];
		/** Every role of this conference, in its order, for the filter. */
		roles: TeamRole[];
		/** The role the address asked for, or `all`. */
		filter: TeamFilter;
		/** The conference's slug, for the links. */
		conferenceSlug: string;
		/** The organisation running the conference, which its members' Title cell names. */
		organizationName: string;
		/** The signed-in reader's id, so their own row can say "You". */
		viewerUserId: string | null;
		/** The people whose rows have actions: below the reader, by the rank rule. */
		actionableUserIds: string[];
		/** Whether the reader may manage roles, which puts the "Roles" link beside the title. */
		canManageRoles: boolean;
	};

	let {
		people,
		committees,
		roles,
		filter,
		conferenceSlug,
		organizationName,
		viewerUserId,
		actionableUserIds,
		canManageRoles
	}: Props = $props();

	/*
		One instant form for every row (`$lib/instant-form.svelte.ts`): a new
		title or committee, or a removal, shows the moment it is pressed, and a
		refused one goes back with a toast naming it (T142). `teamPeople` is the
		loaded list with the presses still on their way laid on top, and
		everything below is drawn from it.
	*/
	const staffForm = createInstantForm<StaffChange>({ describeFailure: describeStaffFailure });

	/** What a press will change, judged against the team as the page shows it now. */
	function expectPress(input: InstantSubmitInput): StaffChange | null {
		return expectStaffChange(input, teamPeople, committees);
	}

	const submitStaffPress = staffForm.submitExpecting(expectPress);
	const teamPeople = $derived(teamPeopleAfterPresses(people, committees, staffForm.presses));
	const shownPeople = $derived(filterTeamPeople(teamPeople, filter, roles));
	const shownCount = $derived(
		shownPeople.length === 1 ? '1 person' : `${shownPeople.length} people`
	);

	/*
		The empty state is about the conference's own staff and not about the
		role picked: the organisation's members are listed all the same, because
		they really do run this conference, but they were not invited to it.
	*/
	const hasStaff = $derived(teamPeople.some((person) => person.source === 'staff'));
	const isEmpty = $derived(shownPeople.length === 0 || !hasStaff);
</script>

<ManageSection
	title="People"
	link={canManageRoles ? { label: 'Roles', href: manageRolesUrl(conferenceSlug) } : undefined}
>
	<TeamFilterForm {roles} {filter} {shownCount} />

	<!--
		The empty state is a block beside the list rather than its `{:else}`,
		because the organisation's members are still listed under it when the
		conference has no staff of its own. A role nobody holds draws no table,
		not even its headings.
	-->
	{#if isEmpty}
		<div class="mb-4">
			<EmptyState
				icon={Users}
				title="No staff yet."
				description="Invite your chairs and volunteers by email."
			/>
		</div>
	{/if}

	{#if shownPeople.length > 0}
		<StaffList
			people={shownPeople}
			{committees}
			{filter}
			{conferenceSlug}
			{organizationName}
			{viewerUserId}
			{actionableUserIds}
			onSubmit={submitStaffPress}
		/>
	{/if}
</ManageSection>
