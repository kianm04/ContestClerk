<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import Users from '@lucide/svelte/icons/users';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ManageHeader from '$lib/components/manage/ManageHeader.svelte';
	import StepFooter from '$lib/components/manage/StepFooter.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import { committeesSummary } from '$lib/committee-list';
	import { findSetupStep, setupStepEyebrow, setupSteps } from '$lib/setup-steps';
	import { newCommitteeUrl } from '$lib/urls';
	import CommitteeList from './CommitteeList.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` in `+page.server.ts` returned together with what the
	// layout above it loaded, which is where the conference itself comes from.
	// `form` is what the last action returned, and is `null` until `move` or
	// `moveTo` has refused one: a move that worked redirects instead of returning.
	let { data, form }: PageProps = $props();

	// `$derived` writes the line again whenever the list changes, which it does
	// after every move.
	const summary = $derived(committeesSummary(data.committees.length, data.seatTotal));

	// The six setup steps while the conference is a draft, and null once it is
	// published, when this page is an ordinary list with no footer.
	const steps = $derived(
		data.setupProgress === null ? null : setupSteps(data.conference.slug, data.setupProgress)
	);
	const eyebrow = $derived(
		steps === null ? undefined : setupStepEyebrow(findSetupStep(steps, 'committees'))
	);
</script>

<svelte:head>
	<!-- A private page has nothing to share, so it writes its own title rather
		than using `PageMeta`, which asks for a description for the link card. -->
	<title>Committees · {data.conference.name} · MUNMeet</title>
</svelte:head>

<ManageHeader title="Committees" {eyebrow} {summary}>
	{#if data.isWholeEditor}
		<Button
			label="Add committee"
			variant="primary"
			size="dense"
			icon={Plus}
			href={newCommitteeUrl(data.conference.slug)}
		/>
	{/if}
</ManageHeader>

{#if form?.message}
	<div class="pb-4">
		<Notice tone="error">{form.message}</Notice>
	</div>
{/if}

{#if data.committees.length === 0 && !data.isWholeEditor}
	<p class="py-4">No committees are assigned to you yet.</p>
{:else if data.committees.length === 0}
	<EmptyState
		icon={Users}
		title="No committees yet."
		description="Add the bodies your delegates will sit in, with their topics and seats."
		actionLabel="Add committee"
		actionHref={newCommitteeUrl(data.conference.slug)}
	/>
{:else}
	<CommitteeList
		committees={data.committees}
		conferenceSlug={data.conference.slug}
		isReorderable={data.isWholeEditor}
		roomCommitteeIds={data.roomCommitteeIds}
	/>
{/if}

<!-- Every move saves at once, so the footer's "Continue" is only a link onwards. -->
{#if steps}
	<StepFooter {steps} current="committees" />
{/if}
