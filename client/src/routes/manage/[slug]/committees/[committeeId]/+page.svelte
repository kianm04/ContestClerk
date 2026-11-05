<script lang="ts">
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Button from '$lib/components/Button.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import BackLink from '$lib/components/manage/BackLink.svelte';
	import ManageHeader from '$lib/components/manage/ManageHeader.svelte';
	import { hasCommitteeErrors } from '$lib/committee-details';
	import { committeeEditorSummary } from '$lib/committee-editor';
	import { committeeHeading } from '$lib/committees';
	import { chairRoomUrl, committeeUrl, manageCommitteesUrl } from '$lib/urls';
	import CommitteeForm from '../CommitteeForm.svelte';
	import CommitteeAgendaForm from './CommitteeAgendaForm.svelte';
	import BackgroundGuidePanel from './BackgroundGuidePanel.svelte';
	import ChairsPanel from './ChairsPanel.svelte';
	import ResolutionsSection from './ResolutionsSection.svelte';
	import SeatsSection from './SeatsSection.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` in `+page.server.ts` returned together with what the
	// layout above it loaded, which is where the conference itself comes from.
	// `form` is what the last action returned. Most of the actions here redirect
	// when they work, so `form` is usually a refusal — but "Add topic" and
	// "Remove topic" answer without saving anything, and those two are why the
	// notice below asks what went wrong rather than assuming something did.
	let { data, form }: PageProps = $props();

	/** What the notice says when the fields themselves are what need fixing. */
	const FIELDS_FAILURE_MESSAGE = 'Please fix the fields below.';

	// A refused save sends back everything that was typed, so nothing is lost.
	// An action that never touched the committee form sends back `null`, and then
	// the page shows what is saved. `$derived` works both out again on every new
	// `form`.
	const values = $derived(form?.values ?? data.values);
	const errors = $derived(form?.errors ?? {});

	// `message` is filled in when the problem is about the whole page, and the
	// generic line covers the case where single fields carry their own messages.
	const failureMessage = $derived(
		form?.message ?? (hasCommitteeErrors(errors) ? FIELDS_FAILURE_MESSAGE : null)
	);

	// The committee's short name when it has one, which keeps the tab's title short.
	const heading = $derived(committeeHeading(data.committee));
	const summary = $derived(
		committeeEditorSummary(data.committee, data.seatCounts.total, data.chairs.length)
	);
	const isConferencePublished = $derived(data.conference.status === 'published');

	// The "Resolutions" settings answer for themselves in the same way: what was
	// typed and why it was refused, or else the settings as saved.
	const procedureValues = $derived(form?.procedure?.values ?? data.procedureValues);
	const procedureErrors = $derived(form?.procedure?.errors ?? {});
</script>

<svelte:head>
	<!-- A private page has nothing to share, so it writes its own title rather
		than using `PageMeta`, which asks for a description for the link card. -->
	<title>{heading} · {data.conference.name} · MUNMeet</title>
</svelte:head>

<div class="lg:mb-2">
	<BackLink href={manageCommitteesUrl(data.conference.slug)} label="Committees" />
</div>

<ManageHeader title={data.committee.name} {summary}>
	<Button
		label="View public page"
		variant="secondary"
		size="dense"
		icon={ExternalLink}
		isIconAfterLabel
		href={committeeUrl(data.conference.slug, data.committee.slug)}
	/>
	<!-- The chair's room for this committee, open on every day (T175). -->
	{#if data.access.mayOpenRoom}
		<Button
			label="Open chair room"
			variant="secondary"
			size="dense"
			href={chairRoomUrl(data.conference.slug, data.committee.slug)}
		/>
	{/if}
</ManageHeader>

{#if failureMessage}
	<Notice tone="error">{failureMessage}</Notice>
{/if}

<!-- Each form is the whole `<form method="post" action="?/save">`. A chair who
	edits only this committee gets its description and agenda; the rest is a
	conference-wide editor's (`$lib/committee-access.ts`). -->
{#if data.access.isWholeEditor}
	<CommitteeForm
		{values}
		{errors}
		hasSharedLink={isConferencePublished}
		submitLabel="Save changes"
	/>
{:else}
	<CommitteeAgendaForm {values} {errors} />
{/if}

<!-- Each section below has forms of its own, which save the moment they are used. -->
{#if data.access.mayManageChairs}
	<ChairsPanel
		chairs={data.chairs}
		removableChairIds={data.removableChairIds}
		chairStaff={data.chairStaff}
		pendingInvites={data.pendingChairInvites}
		readerUserId={data.readerUserId}
		mayChairYourself={data.mayChairYourself}
		origin={data.origin}
		chairInvite={form?.chairInvite ?? null}
	/>
{/if}

<BackgroundGuidePanel guide={data.backgroundGuide} />

<ResolutionsSection
	values={procedureValues}
	errors={procedureErrors}
	copyTargets={data.procedureCopyTargets}
/>

{#if data.access.isWholeEditor}
	<SeatsSection seats={data.seats} counts={data.seatCounts} />

	<div class="flex flex-wrap items-center justify-between gap-2 border-t border-border py-5">
		<p class="text-small text-muted-foreground">
			Deleting the committee removes its seats. This cannot be undone.
		</p>
		<!-- `ConfirmButton` asks "Are you sure?" in a dialog before it posts. -->
		<ConfirmButton
			label="Delete committee"
			confirmTitle="Delete {data.committee.name}?"
			confirmText="Its seats go with it. This cannot be undone."
			formaction="?/deleteCommittee"
			variant="soft-danger"
			size="dense-sm"
		/>
	</div>
{/if}
