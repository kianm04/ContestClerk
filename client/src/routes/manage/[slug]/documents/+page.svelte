<script lang="ts">
	import Upload from '@lucide/svelte/icons/upload';
	// `resolve` builds an address inside this app from a route and its parameters.
	import { resolve } from '$app/paths';
	import Button from '$lib/components/Button.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import ManageHeader from '$lib/components/manage/ManageHeader.svelte';
	import ManageTabs from '$lib/components/manage/ManageTabs.svelte';
	import { documentsTabs, totalPaperCounts } from '$lib/documents-page';
	import BackgroundGuideList from './BackgroundGuideList.svelte';
	import PositionPaperOverview from './PositionPaperOverview.svelte';
	import ResourceList from './ResourceList.svelte';
	import ResourceUploadForm from './ResourceUploadForm.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` in `+page.server.ts` returned together with what the
	// layout above it loaded, which is where the conference comes from. `load`
	// runs again whenever the address changes, such as on a tab, and after every
	// action. `form` is what the last action answered without redirecting: a
	// refusal, with whatever was typed.
	let { data, form }: PageProps = $props();

	// `$derived` works each of these out again whenever `data` or `form` changes.
	const slug = $derived(data.conference.slug);
	const paperTotals = $derived(totalPaperCounts(data.paperCommittees));
	const tabs = $derived(
		documentsTabs(slug, data.view.tab, {
			resourceCount: data.resources.length,
			guideCount: data.guides.filter((committee) => committee.guide).length,
			committeeCount: data.guides.length,
			...paperTotals
		})
	);

	/*
		"Upload document" jumps down to the upload form under the table. The part
		after `#` is the form's `id`, so the browser scrolls there by itself,
		without JavaScript. It is only a jump, so it is a secondary button: the
		form's own "Upload" is the screen's one primary button.
	*/
	const uploadFormHref = $derived(resolve('/manage/[slug]/documents#upload-document', { slug }));
</script>

<svelte:head>
	<title>Documents · {data.conference.name} · MUNMeet</title>
</svelte:head>

<ManageHeader title="Documents">
	{#if data.view.tab === 'resources'}
		<Button
			label="Upload document"
			variant="secondary"
			size="dense"
			icon={Upload}
			href={uploadFormHref}
		/>
	{/if}
</ManageHeader>

<!-- A documents manager without the committees' documents has one list and no tabs. -->
{#if data.canSeeCommitteeDocuments}
	<ManageTabs {tabs} label="Documents" />
{/if}

<div class="flex flex-col">
	{#if form?.message}
		<div class="mb-5">
			<Notice tone="error">{form.message}</Notice>
		</div>
	{/if}

	{#if data.view.tab === 'resources'}
		<ResourceList resources={data.resources} timezone={data.conference.timezone} />
		<ResourceUploadForm
			values={form?.resourceValues ?? null}
			errors={form?.resourceErrors ?? {}}
			conferenceSlug={slug}
		/>
	{:else if data.view.tab === 'guides'}
		<BackgroundGuideList
			guides={data.guides}
			errorCommitteeId={form?.guideCommitteeId ?? null}
			error={form?.guideError ?? null}
			conferenceSlug={slug}
		/>
	{:else}
		<PositionPaperOverview
			conference={data.conference}
			committees={data.paperCommittees}
			selectedCommittee={data.selectedCommittee}
			seats={data.paperSeats}
			view={data.view}
			reviewComment={form?.reviewComment ?? ''}
			reviewError={form?.reviewError ?? null}
		/>
	{/if}
</div>
