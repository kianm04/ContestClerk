<script lang="ts">
	import Notice from '$lib/components/Notice.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SeatName from '$lib/components/SeatName.svelte';
	import Tabs from '$lib/components/Tabs.svelte';
	import DeleteCommentDialog from '$lib/components/paper-margin/DeleteCommentDialog.svelte';
	import PageMeta from '$lib/components/shell/PageMeta.svelte';
	import { canUploadPositionPaper } from '$lib/documents';
	import { delegationWriters, sharedWithText } from '$lib/delegation-papers';
	import { paperWayTabs, paperWriteView, writerStart } from '$lib/paper-writing';
	import { committeeUrl, positionPaperWayUrl } from '$lib/urls';
	import RemovePaperButton from './RemovePaperButton.svelte';
	import UploadWay from './UploadWay.svelte';
	import WriteWay from './WriteWay.svelte';
	import type { PageProps } from './$types';

	// `data` is whatever `load` in `+page.server.ts` returned; `load` runs again
	// when the address changes, as when the reader picks the other tab. `form`
	// is whatever an action on this page last answered with; it stays
	// `undefined` until a form on this page has been submitted.
	let { data, form }: PageProps = $props();

	const paper = $derived(data.paper);
	const tabs = $derived(paperWayTabs(paper.conference.slug, paper.committee.slug, data.way));

	// Where the editor starts, keeping any text a refused save or submit handed back.
	const start = $derived(
		writerStart({
			draft: data.draft,
			submittedBody: paper.document?.bodyMarkdown ?? null,
			returnedText: form?.draftText ?? null,
			conflictRevision: form?.draftConflict?.revision ?? null
		})
	);

	// A shared paper is written live (T148), over the browser's Supabase client from the root layout.
	const live = $derived(data.live ? { setup: data.live, supabase: data.supabase } : null);

	/*
		This only decides what the page draws: the upload box or the closed
		notice. The `upload` action asks the same function again before it
		changes anything, so a wrong clock here could show the wrong thing,
		never let anyone past a rule the server does not also check.
	*/
	const now = new Date();

	const closedReason = $derived(
		canUploadPositionPaper(paper.conference, paper.document?.reviewStatus ?? null, now)
	);

	// The page every comment form comes back to, and which closes the delete dialog.
	const paperUrl = $derived(
		positionPaperWayUrl(paper.conference.slug, paper.committee.slug, 'write')
	);
	const commentAddress = $derived(data.commentAddress);

	// The live editor has the delegation's comments beside it, so the page widens to hold them.
	const isWritingLive = $derived(
		data.way === 'write' &&
			live !== null &&
			data.sharing !== null &&
			paperWriteView({
				isWritten: paper.document?.bodyMarkdown != null,
				isEditing: data.isEditing,
				closedReason
			}) === 'editor'
	);
</script>

<PageMeta
	title="Position paper"
	description={`Your position paper for ${paper.committee.heading}.`}
/>

<!--
	The layout section of `position-paper.md` keeps the page to 880px on a
	desktop, and 1152px while a shared paper's comments sit beside it.
-->
<div class={['mx-auto max-w-220', isWritingLive && 'lg:max-w-288']}>
	<a
		href={committeeUrl(paper.conference.slug, paper.committee.slug)}
		class="text-small text-link hover:underline"
	>
		← {paper.committee.heading} · {paper.conference.name}
	</a>

	<!-- The seat is written under the title with its flag, rather than as the header's plain subtitle. -->
	<div class="mb-6">
		<PageHeader title="Position paper" />
		<p class="mt-1 text-body text-muted-foreground">
			<SeatName name={paper.seat.name} countryCode={paper.seat.countryCode} />
		</p>
	</div>

	{#if !paper.conference.positionPaperRequired}
		<Notice tone="info">
			This conference does not require a position paper, but your chair may still appreciate one.
		</Notice>
	{/if}

	<div class="mt-6 mb-6">
		<Tabs {tabs} />
	</div>

	{#if data.way === 'write'}
		<WriteWay
			conferenceSlug={paper.conference.slug}
			committeeSlug={paper.committee.slug}
			document={paper.document}
			draft={data.draft}
			{start}
			deadline={paper.conference}
			topics={paper.committee.topics}
			{closedReason}
			isEditing={data.isEditing}
			readerId={data.readerId}
			sharedWith={sharedWithText(data.sharing, data.readerId)}
			{live}
			sheetHeading={data.sheetHeading}
			writers={delegationWriters(data.sharing)}
			comments={{
				threads: data.threads,
				paperUrl,
				timeZone: paper.conference.timezone,
				editingCommentId: commentAddress?.action === 'edit' ? commentAddress.comment.id : null
			}}
		/>
	{:else}
		<UploadWay
			document={paper.document}
			deadline={paper.conference}
			{closedReason}
			error={form?.error ?? null}
			topics={paper.committee.topics}
		/>
	{/if}

	<RemovePaperButton conference={paper.conference} document={paper.document} {now} />
</div>

<!-- `?deleteComment=…` asks for this dialog over the page. -->
{#if commentAddress?.action === 'delete'}
	<DeleteCommentDialog commentId={commentAddress.comment.id} closeHref={paperUrl} />
{/if}
