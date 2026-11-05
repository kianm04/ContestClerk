<script lang="ts">
	import Armchair from '@lucide/svelte/icons/armchair';
	import Badge from '$lib/components/Badge.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { JOIN_CODE_CARD_HINT, delegationProgress } from '$lib/delegations';
	import { statusBadgeTone, statusLabel } from '$lib/status';
	import { delegationSeatsUrl, joinDelegationUrl } from '$lib/urls';
	import DelegationStatusCard from './DelegationStatusCard.svelte';
	import EditDelegationForm from './EditDelegationForm.svelte';
	import JoinCodeCard from './JoinCodeCard.svelte';
	import MySeatCard from './MySeatCard.svelte';
	import ProgressCard from './ProgressCard.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` in `+page.server.ts` returned together with what the
	// layout's own `load` above it returned, so the delegation, its conference,
	// the reader's role and the two counts are all in here. Both run again after
	// every action on this page. `form` is what the last action answered with;
	// the three buttons redirect when they work, so it only ever holds the
	// "Details" form's refusal. `PageProps` comes from `./$types`, the types
	// SvelteKit generates for this one route.
	let { data, form }: PageProps = $props();

	// `$derived` works each of these out again whenever `data` or `form` changes.
	const progress = $derived(delegationProgress(data.delegation, data.seatCounts));
	const isHead = $derived(data.myRole === 'head');

	// A delegation the organisers turned down, or one the head took back, has
	// nothing left to do, so `dashboard.md` hides the progress and the join code.
	const isStillRunning = $derived(
		data.delegation.status !== 'rejected' && data.delegation.status !== 'withdrawn'
	);
	const showsHeadCards = $derived(isHead && isStillRunning);
	// `canEdit` also asks whether the conference is still taking delegations,
	// which needs the clock, so `load` works it out on the server once and the
	// page and the browser draw the same thing.
	const showsEditForm = $derived(isHead && data.canEdit);

	// A head who was also given a seat sees both halves, which is the edge case
	// `dashboard.md` names.
	const showsSeatCard = $derived(!isHead || data.mySeat !== null);
	const editValues = $derived(form?.values ?? data.editValues);
	const editErrors = $derived(form?.errors ?? {});
</script>

<svelte:head>
	<!-- A page only this delegation's own people can open writes its own title,
		rather than using `PageMeta`, which asks for a description for a link card. -->
	<title>{data.delegation.name} · {data.conference.name} · MUNMeet</title>
</svelte:head>

<!-- Two columns at most, so the page keeps to 960px inside the shell. -->
<div class="mx-auto max-w-240">
	<div class="mb-6">
		<PageHeader eyebrow={data.conference.name} title={data.delegation.name}>
			<Badge
				tone={statusBadgeTone('delegation_status', data.delegation.status)}
				label={statusLabel('delegation_status', data.delegation.status)}
			/>
		</PageHeader>
	</div>

	<!--
		One column on a phone and two from the `md` width up, as `dashboard.md`
		asks. `items-start` keeps every card as tall as its own contents instead
		of stretching it to match its neighbour.
	-->
	<div class="grid items-start gap-6 md:grid-cols-2">
		<DelegationStatusCard
			delegation={data.delegation}
			conference={data.conference}
			{progress}
			myRole={data.myRole}
		/>

		{#if showsHeadCards}
			<ProgressCard
				requested={progress.requested}
				allocated={progress.allocated}
				assigned={progress.assigned}
				percentAssigned={progress.percentAssigned}
				seatsHref={data.myRole === 'head' ? delegationSeatsUrl(data.delegation.id) : null}
			/>

			<!--
				No closed notice here: `dashboard.md` hides the whole card, with the
				progress card, once the delegation is rejected or withdrawn.
			-->
			<JoinCodeCard
				joinCode={data.delegation.joinCode}
				joinPath={joinDelegationUrl(data.delegation.joinCode)}
				heading="Join code"
				hint={JOIN_CODE_CARD_HINT}
				closedNotice={null}
			/>
		{/if}

		{#if showsSeatCard}
			{#if data.mySeat}
				<MySeatCard seat={data.mySeat} conferenceSlug={data.conference.slug} />
			{:else}
				<EmptyState
					icon={Armchair}
					title="No seat assigned yet."
					description="Your head assigns seats once the organisers allocate them."
				/>
			{/if}
		{/if}
	</div>

	<!--
		`dashboard.md` draws an Invoices card here. It cannot be written yet: a
		delegation only ever gets an invoice from `allocate_delegation_seats`,
		which is task T27, and the "Pay" button on it would link to
		`/invoices/[invoiceId]`, which is T31. `resolve()` from `$app/paths`
		refuses an address whose folder is not under `src/routes/`, so neither
		half can be written. Add the card once T27 and T31 have built them.
	-->

	{#if showsEditForm}
		<div class="mt-6">
			<EditDelegationForm values={editValues} errors={editErrors} />
		</div>
	{/if}
</div>
