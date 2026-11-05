<script lang="ts">
	import DeleteCommentDialog from '$lib/components/paper-margin/DeleteCommentDialog.svelte';
	import PaperAmendmentsLive from '$lib/components/amendments/PaperAmendmentsLive.svelte';
	import PaperThreadsLive from '$lib/components/paper-margin/PaperThreadsLive.svelte';
	import { paperKindAndNumber } from '$lib/committee-papers';
	import { chairResolutionDialogUrl, chairResolutionUrl, chairResolutionsUrl } from '$lib/urls';
	import DaisReviewColumns from './DaisReviewColumns.svelte';
	import ReturnDialog from './ReturnDialog.svelte';
	import RuleOutDialog from './RuleOutDialog.svelte';
	import ReviewTitleRow from './ReviewTitleRow.svelte';
	import WithdrawDialog from './WithdrawDialog.svelte';
	import type { PageProps } from './$types';

	// `data` holds what the chair layout's `load` returned and what this page's
	// `load` added in `+page.server.ts`; both run again after every form sent.
	let { data }: PageProps = $props();

	const conferenceSlug = $derived(data.conference.slug);
	const committeeSlug = $derived(data.committee.slug);
	const paperUrl = $derived(chairResolutionUrl(conferenceSlug, committeeSlug, data.paper.id));
	// The note `?editComment=` or `?deleteComment=` opens, so both work without JavaScript.
	const commentAddress = $derived(data.commentAddress);
</script>

<svelte:head>
	<title>{data.paper.title} · {data.papersTitle} · {data.committee.name} · MUNMeet</title>
</svelte:head>

<ReviewTitleRow
	title={data.paper.title}
	headingId="paper-title"
	metaLine={data.metaLine}
	kind={data.paper.kind}
	status={data.paper.status}
	proposedNumber={data.proposedNumber}
	back={{ text: data.papersTitle, href: chairResolutionsUrl(conferenceSlug, committeeSlug) }}
	returnHref={chairResolutionDialogUrl(conferenceSlug, committeeSlug, data.paper.id, 'return')}
	withdrawHref={chairResolutionDialogUrl(conferenceSlug, committeeSlug, data.paper.id, 'withdraw')}
	screen={data.screen}
/>

<DaisReviewColumns
	{conferenceSlug}
	{committeeSlug}
	paper={data.paper}
	people={data.people}
	words={data.words}
	paperWords={data.paperWords}
	support={data.support}
	heading={data.heading}
	text={{ documentState: data.documentState, body: data.body, bodyHtml: data.bodyHtml }}
	notes={{
		threads: data.threads,
		writer: data.writer,
		isOpen: data.mayComment,
		paperUrl,
		timeZone: data.conference.timezone,
		editingCommentId: commentAddress?.action === 'edit' ? commentAddress.comment.id : null,
		userId: data.readerId
	}}
	headingId="paper-title"
	amendments={data.amendments}
/>

<!-- Keeps the notes up to date while the other members of the dais write them. -->
<PaperThreadsLive
	supabase={data.supabase}
	paper={{ kind: 'committee', paperId: data.paper.id }}
	threadIds={data.threads.map((thread) => thread.id)}
	commentIds={data.threads.flatMap((thread) => thread.comments.map((comment) => comment.id))}
/>

{#if data.amendments}
	<!-- Keeps the amendments up to date as delegates propose, support and withdraw them. -->
	<PaperAmendmentsLive supabase={data.supabase} paperId={data.paper.id} />
{/if}

<!-- The dialog the address asks for, over the page: `?return=1`, `?withdraw=1` or `?deleteComment=…`. -->
{#if data.dialog === 'return'}
	<ReturnDialog
		title={data.paper.title}
		maxLength={data.returnCommentMaxLength}
		closeHref={paperUrl}
	/>
{:else if data.dialog === 'withdraw'}
	<WithdrawDialog
		name={paperKindAndNumber(data.paper)}
		title={data.paper.title}
		closeHref={paperUrl}
	/>
{:else if data.rulingOut}
	<RuleOutDialog amendment={data.rulingOut} maxLength={data.rulingMaxLength} closeHref={paperUrl} />
{:else if commentAddress?.action === 'delete'}
	<DeleteCommentDialog commentId={commentAddress.comment.id} closeHref={paperUrl} />
{/if}
