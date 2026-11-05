<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import ManageHeader from '$lib/components/manage/ManageHeader.svelte';
	import StepFooter from '$lib/components/manage/StepFooter.svelte';
	import { findSetupStep, setupStepEyebrow, setupSteps } from '$lib/setup-steps';
	import { EMPTY_INVITE_FORM } from '$lib/team';
	import { teamSummarySentence } from '$lib/team-summary';
	import { manageTeamFilterUrl } from '$lib/urls';
	import EditRolesDialog from './EditRolesDialog.svelte';
	import InviteStaffForm from './InviteStaffForm.svelte';
	import PendingInvites from './PendingInvites.svelte';
	import StaffTable from './StaffTable.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` in `+page.server.ts` returned together with what the
	// layout above it loaded, which is where the conference itself comes from.
	// `load` runs again on every new `/manage/<slug>/team?role=` address, and
	// again after each action, so the lists below are never stale. `?edit=`
	// opens the "Edit roles" dialog over the list.
	//
	// `form` is what the last action returned. Most of them redirect when they
	// work, so `form` is usually a refusal — but `invite` and `resendInvite`
	// stay on the page to hand back the link they just made.
	let { data, form }: PageProps = $props();

	// `$derived` works each of these out again whenever `data` or `form` changes.
	const summary = $derived(
		teamSummarySentence(data.team.people.length, data.team.pendingInvites.length)
	);
	const failureMessage = $derived(form?.message ?? form?.inviteMessage ?? null);

	// A refused invitation sends back everything that was typed, so nothing is
	// lost; one that worked sends back an empty form, ready for the next person.
	const inviteValues = $derived(form?.inviteValues ?? EMPTY_INVITE_FORM);
	const inviteErrors = $derived(form?.inviteErrors ?? {});

	// The six setup steps while the conference is a draft, and null once it is
	// published, when this page is an ordinary settings page with no footer.
	const steps = $derived(
		data.setupProgress === null ? null : setupSteps(data.conference.slug, data.setupProgress)
	);
	const eyebrow = $derived(
		steps === null ? undefined : setupStepEyebrow(findSetupStep(steps, 'team'))
	);
</script>

<svelte:head>
	<!-- A private page has nothing to share, so it writes its own title rather
		than using `PageMeta`, which asks for a description for the link card. -->
	<title>Team · {data.conference.name} · MUNMeet</title>
</svelte:head>

<ManageHeader title="Team" {eyebrow} {summary} />

<!-- 2.25rem between the sections, as the design spaces them. -->
<div class="flex flex-col gap-9">
	{#if failureMessage}
		<Notice tone="error">{failureMessage}</Notice>
	{/if}

	<!-- Email delivery is Phase 2, so a new invitation hands the organiser its
		link to send on by hand. The same link is in the pending list below. -->
	{#if form?.createdInvite}
		<Notice tone="success" title="Copy this link and send it to {form.createdInvite.email}">
			<p class="mt-1 font-mono text-small break-all">{form.createdInvite.link}</p>
		</Notice>
	{/if}

	<InviteStaffForm
		values={inviteValues}
		errors={inviteErrors}
		committees={data.team.committees}
		roles={data.giveableRoles}
	/>

	<!-- `team.md`: with no invitations waiting, the whole section is left out
		rather than shown empty. -->
	{#if data.team.pendingInvites.length > 0}
		<PendingInvites
			invites={data.team.pendingInvites}
			changeableInviteIds={data.changeableInviteIds}
			now={data.now}
			origin={data.origin}
		/>
	{/if}

	<StaffTable
		people={data.team.people}
		committees={data.team.committees}
		roles={data.team.roles}
		filter={data.filter}
		conferenceSlug={data.conference.slug}
		organizationName={data.organization.name}
		viewerUserId={data.viewerUserId}
		actionableUserIds={data.actionableUserIds}
		canManageRoles={data.canManageRoles}
	/>
</div>

{#if data.editRoles}
	<EditRolesDialog
		person={data.editRoles.person}
		choices={data.editRoles.choices}
		filter={data.filter}
		closeHref={manageTeamFilterUrl(data.conference.slug, data.filter)}
	/>
{/if}

<!--
	While a draft, the footer moves on to the next step. Nothing on this page
	needs saving first, because every form here saves on its own, so the footer
	is given no form and says "Continue".
-->
{#if steps}
	<StepFooter {steps} current="team" />
{/if}
