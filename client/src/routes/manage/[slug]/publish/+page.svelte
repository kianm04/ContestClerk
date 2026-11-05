<script lang="ts">
	import ConferencePreviewCard from '$lib/components/manage/ConferencePreviewCard.svelte';
	import ManageHeader from '$lib/components/manage/ManageHeader.svelte';
	import ManageSection from '$lib/components/manage/ManageSection.svelte';
	import { findSetupStep, setupStepEyebrow, setupSteps } from '$lib/setup-steps';
	import { conferenceUrl, manageTeamUrl } from '$lib/urls';
	import DeleteDraftFooter from './DeleteDraftFooter.svelte';
	import ReviewRow from './ReviewRow.svelte';
	import WhenYouPublish from './WhenYouPublish.svelte';
	import WorthDoing from './WorthDoing.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` in `+page.server.ts` returned together with what the
	// layout above it loaded, which is where the conference itself comes from.
	// `form` is what the last action returned, and is `null` until one of them
	// has refused: an action that worked redirects instead of returning.
	let { data, form }: PageProps = $props();

	// The six setup steps. `load` sends anything but a draft away, so they are
	// always there, but the layout's type allows for a published conference.
	const steps = $derived(
		data.setupProgress === null ? null : setupSteps(data.conference.slug, data.setupProgress)
	);

	// "Step 6 of 6". `$derived` works both out again when the steps change.
	const eyebrow = $derived(
		steps === null ? undefined : setupStepEyebrow(findSetupStep(steps, 'publish'))
	);
</script>

<svelte:head>
	<!-- A private page has nothing to share, so it writes its own title rather
		than using `PageMeta`, which asks for a description for the link card. -->
	<title>Review and publish · {data.conference.name} · MUNMeet</title>
</svelte:head>

<ManageHeader title="Review and publish" {eyebrow} summary={data.summary} />

<div class="mb-7 h-px bg-border"></div>

<!--
	Two columns from a wide screen down, one on a phone: `flex-wrap` drops the
	preview under the review once the two no longer fit side by side.
-->
<div class="flex flex-wrap items-start gap-x-14 gap-y-10">
	<div class="flex min-w-0 flex-1 basis-120 flex-col gap-9">
		<ManageSection title="What goes public">
			<ul>
				<!-- The `(row.label)` key lets Svelte reuse rows instead of rebuilding them. -->
				{#each data.rows as row (row.label)}
					<ReviewRow {row} />
				{/each}
			</ul>
		</ManageSection>

		{#if data.worthDoing.length > 0}
			<WorthDoing items={data.worthDoing} />
		{/if}

		<WhenYouPublish
			bullets={data.bullets}
			missingLines={data.missingLines}
			publishError={form?.publishError ?? null}
			backHref={manageTeamUrl(data.conference.slug)}
		/>
	</div>

	<aside
		aria-label="What visitors will see"
		class="flex min-w-60 flex-1 basis-75 flex-col gap-2.5 xl:grow-0"
	>
		<div class="flex items-baseline justify-between gap-4">
			<h2 class="text-h3 text-foreground">What visitors will see</h2>
			<a href={conferenceUrl(data.conference.slug)} class="text-dense font-medium text-link">
				Preview
			</a>
		</div>

		<ConferencePreviewCard preview={data.preview} />
	</aside>
</div>

<DeleteDraftFooter
	conferenceName={data.conference.name}
	isDeletable={data.isDeletable}
	deleteError={form?.deleteError ?? null}
/>
