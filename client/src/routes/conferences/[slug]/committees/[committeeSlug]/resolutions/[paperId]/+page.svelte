<script lang="ts">
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import DeleteCommentDialog from '$lib/components/paper-margin/DeleteCommentDialog.svelte';
	import PaperThreadsLive from '$lib/components/paper-margin/PaperThreadsLive.svelte';
	import { leavePaperSentence } from '$lib/committee-papers';
	import { writerStart } from '$lib/paper-writing';
	import {
		committeePaperDialogUrl,
		committeePapersUrl,
		committeePaperUrl,
		committeeUrl
	} from '$lib/urls';
	import AddAuthorDialog from './AddAuthorDialog.svelte';
	import CommitteePaperReader from './CommitteePaperReader.svelte';
	import CommitteePaperWriter from './CommitteePaperWriter.svelte';
	import DeletePaperDialog from './DeletePaperDialog.svelte';
	import IntroducedDraftPage from './IntroducedDraftPage.svelte';
	import LeavePaperDialog from './LeavePaperDialog.svelte';
	import WithdrawPaperDialog from './WithdrawPaperDialog.svelte';
	import type { PageProps } from './$types';

	// `data` is what `load` returned. `form` is what an action last answered
	// with: a refused save hands back the text it was given, so nothing typed
	// without JavaScript is lost.
	let { data, form }: PageProps = $props();

	const conferenceSlug = $derived(data.conference.slug);
	const committeeSlug = $derived(data.committee.slug);
	const paperUrl = $derived(committeePaperUrl(conferenceSlug, committeeSlug, data.paper.id));
	const isLead = $derived(data.people.some((person) => person.isMine && person.isLead));
	const commentAddress = $derived(data.commentAddress);
	const comments = $derived({
		threads: data.threads,
		paperUrl,
		timeZone: data.conference.timezone,
		editingCommentId: commentAddress?.action === 'edit' ? commentAddress.comment.id : null
	});
	// An introduced paper's threads, kept to read beside it; none to show is no section at all.
	const floor = $derived({
		...data.floor,
		closedThreads: data.areThreadsClosed && data.threads.length > 0 ? data.threads : null
	});
</script>

<svelte:head>
	<title>{data.paper.title} · {data.committee.heading} · {data.conference.name} · MUNMeet</title>
</svelte:head>

<Breadcrumb
	links={[
		{ href: committeeUrl(conferenceSlug, committeeSlug), label: data.committee.heading },
		{ href: committeePapersUrl(conferenceSlug, committeeSlug), label: data.papersTitle }
	]}
/>

<!--
	An author writes the paper; anybody else who may open it reads it. An
	introduced draft resolution is read with its amendments beside it.
-->
{#if data.writing}
	<CommitteePaperWriter
		{conferenceSlug}
		{committeeSlug}
		paper={data.paper}
		people={data.people}
		words={data.words}
		actions={data.actions}
		draft={data.writing.draft}
		start={writerStart({
			draft: data.writing.draft,
			submittedBody: null,
			returnedText: form?.draftText ?? null,
			conflictRevision: form?.draftConflict?.revision ?? null
		})}
		live={{ setup: data.writing.live, supabase: data.supabase }}
		{comments}
		resolution={data.resolution}
		signing={data.signing}
		progress={data.progress}
		isSubmitOpen={data.dialog === 'submit'}
	/>
{:else if data.introduced && data.resolution}
	<IntroducedDraftPage
		{data}
		introduced={data.introduced}
		resolution={data.resolution}
		{floor}
		{paperUrl}
	/>
{:else}
	<CommitteePaperReader
		{conferenceSlug}
		{committeeSlug}
		paper={data.paper}
		people={data.people}
		words={data.words}
		bodyHtml={data.bodyHtml ?? ''}
		resolution={data.resolution}
		signing={data.signing}
		timeZone={data.conference.timezone}
		comments={data.mayComment ? { ...comments, userId: data.userId } : null}
		progress={data.progress}
		withdrawHref={data.actions.canWithdraw
			? committeePaperDialogUrl(conferenceSlug, committeeSlug, data.paper.id, 'withdraw')
			: null}
		{floor}
	/>
{/if}

{#if data.mayComment}
	<!-- Keeps the margin's threads up to date while others comment. -->
	<PaperThreadsLive
		supabase={data.supabase}
		paper={{ kind: 'committee', paperId: data.paper.id }}
		threadIds={data.threads.map((thread) => thread.id)}
		commentIds={data.threads.flatMap((thread) => thread.comments.map((comment) => comment.id))}
	/>
{/if}

<!--
	The dialog the address asks for, over the page: `?add=1`, `?leave=1`,
	`?delete=1`, `?withdraw=1` or `?deleteComment=…`. The writer opens
	`?submit=1` itself, as it saves the last words typed first.
-->
{#if data.dialog === 'add'}
	<AddAuthorDialog words={data.words} seats={data.seatsToAdd} closeHref={paperUrl} />
{:else if data.dialog === 'leave'}
	<LeavePaperDialog
		title={data.paper.title}
		sentence={leavePaperSentence(isLead, data.words)}
		closeHref={paperUrl}
	/>
{:else if data.dialog === 'delete'}
	<DeletePaperDialog title={data.paper.title} closeHref={paperUrl} />
{:else if data.dialog === 'withdraw'}
	<WithdrawPaperDialog title={data.paper.title} kind={data.paper.kind} closeHref={paperUrl} />
{:else if commentAddress?.action === 'delete'}
	<DeleteCommentDialog commentId={commentAddress.comment.id} closeHref={paperUrl} />
{/if}
