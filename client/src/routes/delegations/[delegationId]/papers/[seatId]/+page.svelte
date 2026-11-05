<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SeatName from '$lib/components/SeatName.svelte';
	import DeleteCommentDialog from '$lib/components/paper-margin/DeleteCommentDialog.svelte';
	import PaperThreadsLive from '$lib/components/paper-margin/PaperThreadsLive.svelte';
	import { delegationWriters, sharedWithText } from '$lib/delegation-papers';
	import { writerStart } from '$lib/paper-writing';
	import { delegationPaperUrl } from '$lib/urls';
	import SharedPaperWay from './SharedPaperWay.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` in `+page.server.ts` returned, together with what the
	// delegation layout's `load` above it returned. `form` is what `saveDraft`
	// last answered with; it stays `undefined` until the form has been posted.
	let { data, form }: PageProps = $props();

	const paper = $derived(data.paper);

	// Where the editor starts, keeping any text a refused save handed back.
	const start = $derived(
		writerStart({
			draft: data.draft,
			submittedBody: null,
			returnedText: form?.draftText ?? null,
			conflictRevision: form?.draftConflict?.revision ?? null
		})
	);

	// A shared paper is written live (T148), over the browser's Supabase client from the root layout.
	const live = $derived(data.live ? { setup: data.live, supabase: data.supabase } : null);

	// The page every comment form comes back to, and which closes the delete dialog.
	const paperUrl = $derived(delegationPaperUrl(data.delegation.id, paper.seatId));
	const commentAddress = $derived(data.commentAddress);

	// The live editor has the delegation's comments beside it, so the page widens to hold them.
	const isWritingLive = $derived(data.view === 'editor' && live !== null && data.sharing !== null);
</script>

<svelte:head>
	<title>{paper.holderName}'s position paper · {data.delegation.name} · MUNMeet</title>
</svelte:head>

<!--
	The same 880px as the delegate's own position paper page, and 1152px
	while the comments sit beside the paper. The Papers tab in
	`+layout.svelte` above is the way back to the list.
-->
<div class={['mx-auto max-w-220', isWritingLive && 'lg:max-w-288']}>
	<!-- The seat is written under the title with its flag, rather than as the header's plain subtitle. -->
	<div class="mb-6">
		<PageHeader title={`${paper.holderName}'s position paper`} />
		<p class="mt-1 text-body text-muted-foreground">
			{paper.committeeName} ·
			<SeatName name={paper.seatName} countryCode={paper.countryCode} />
		</p>
	</div>

	<SharedPaperWay
		{paper}
		draft={data.draft}
		{start}
		deadline={data.deadline}
		topics={data.topics}
		view={data.view}
		closedReason={data.closedReason}
		readerId={data.readerId}
		sharedWith={sharedWithText(data.sharing, data.readerId)}
		{live}
		sheetHeading={data.sheetHeading}
		writers={delegationWriters(data.sharing)}
		comments={{
			threads: data.threads,
			paperUrl,
			timeZone: data.timeZone,
			editingCommentId: commentAddress?.action === 'edit' ? commentAddress.comment.id : null
		}}
	/>
	{#if isWritingLive}
		<!-- Keeps the margin's threads up to date while the delegation comments. -->
		<PaperThreadsLive
			supabase={data.supabase}
			paper={{ kind: 'position', seatId: paper.seatId }}
			threadIds={data.threads.map((thread) => thread.id)}
			commentIds={data.threads.flatMap((thread) => thread.comments.map((comment) => comment.id))}
		/>
	{/if}
</div>

<!-- `?deleteComment=…` asks for this dialog over the page. -->
{#if commentAddress?.action === 'delete'}
	<DeleteCommentDialog commentId={commentAddress.comment.id} closeHref={paperUrl} />
{/if}
