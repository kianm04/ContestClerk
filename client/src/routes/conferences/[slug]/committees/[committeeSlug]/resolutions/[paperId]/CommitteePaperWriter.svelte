<script lang="ts">
	import { onMount } from 'svelte';
	// `browser` is true in the browser and false while the server draws the page.
	import { browser } from '$app/environment';
	import {
		COMMITTEE_PAPER_MESSAGES,
		type AuthorWords,
		type PaperName,
		type PaperPeopleActions,
		type PaperPerson
	} from '$lib/committee-papers';
	import { saveOrAskBeforeLeaving } from '$lib/paper-leave-guard';
	import { createPaperMargin } from '$lib/paper-margin-state.svelte';
	import { createLivePaper, type LivePaperConnection } from '$lib/paper-live.svelte';
	import { signingView, type SigningState } from '$lib/paper-signing';
	import type { PaperDraft, WriterStart } from '$lib/paper-writing';
	import { createPaperChecks } from '$lib/resolution-checks-state.svelte';
	import { committeePaperDialogUrl } from '$lib/urls';
	import AuthorTitleRow from './AuthorTitleRow.svelte';
	import CommitteePaperColumns from './CommitteePaperColumns.svelte';
	import type { PaperComments, PaperProgress, PaperResolution } from './paper-resolution';

	type Props = {
		conferenceSlug: string;
		committeeSlug: string;
		paper: PaperName & { id: string; title: string; topic: string | null };
		/** The paper's authors, the lead first. */
		people: PaperPerson[];
		/** "Authors" and "Lead", or THIMUN's words. */
		words: AuthorWords;
		/** What the reader may do to the paper's people. */
		actions: PaperPeopleActions;
		/** The paper as stored when the page loaded. */
		draft: PaperDraft;
		/** Where the editor starts, worked out by `writerStart` in `$lib/paper-writing.ts`. */
		start: WriterStart;
		/** The live setup from `load`, with the browser's Supabase client. */
		live: LivePaperConnection;
		/** The comment threads on the paper, and what the margin needs to show them. */
		comments: PaperComments;
		/** What a draft resolution or a directive adds, from `load`, or `null` for a working paper. */
		resolution: PaperResolution | null;
		/** Where the paper stands on signing. */
		signing: SigningState;
		/** Where the paper stands with the dais, which may have returned it. */
		progress: PaperProgress;
		/** True when the address asks for "Submit to the dais" (`?submit=1`). */
		isSubmitOpen: boolean;
	};

	let {
		conferenceSlug,
		committeeSlug,
		paper,
		people,
		words,
		actions,
		draft,
		start,
		live,
		comments,
		resolution,
		signing,
		progress,
		isSubmitOpen
	}: Props = $props();

	const HEADING_ID = 'paper-title';

	// The shared document is made once, from what the page first drew, and only in the browser,
	// where every author writes live, even alone, so the next one joins in; without JavaScript the
	// server draws a plain Markdown box. The authors are read from the latest `load` each time.
	// svelte-ignore state_referenced_locally
	const livePaper = browser
		? createLivePaper({
				...live,
				action: '?/saveDraft',
				replacedMessage: COMMITTEE_PAPER_MESSAGES.replaced,
				draft,
				startMarkdown: start.markdown,
				knownWriters: () => live.setup.writers
			})
		: null;

	// The threads and suggestions beside the text, read again on every reload; the reader's id once.
	// svelte-ignore state_referenced_locally
	const margin = createPaperMargin({
		threads: () => comments.threads,
		userId: live.setup.writer.id
	});

	// A draft's or a directive's opening phrases styled, and the format followed. Read once.
	// svelte-ignore state_referenced_locally
	const checks = createPaperChecks({
		kind: paper.kind,
		isOn: resolution?.support.rules.checksFormat ?? false,
		initialMarkdown: start.markdown
	});

	// True once the page's script runs, in the browser (`onMount` never runs on the server).
	let isScriptRunning = $state(false);
	onMount(() => {
		isScriptRunning = true;
		// Joins the other authors now. The function it answers leaves again when the page goes.
		return livePaper?.start();
	});

	// Leaving with text not yet stored saves it first, or has the browser ask.
	saveOrAskBeforeLeaving(livePaper?.save ?? null);

	// What the page says about signing, for a draft resolution or a directive alone.
	const signingShown = $derived(resolution && signingView(signing, comments.timeZone));
</script>

<AuthorTitleRow
	{paper}
	headingId={HEADING_ID}
	{livePaper}
	margin={isScriptRunning ? margin : undefined}
	signing={signingShown}
	support={resolution?.support ?? null}
	canSubmit={actions.canSubmit}
	{progress}
	openSuggestions={live.setup.openSuggestions}
	{comments}
	{isSubmitOpen}
	submitUrl={committeePaperDialogUrl(conferenceSlug, committeeSlug, paper.id, 'submit')}
/>

<CommitteePaperColumns
	{conferenceSlug}
	{committeeSlug}
	{paper}
	{people}
	{words}
	{actions}
	{livePaper}
	{margin}
	{start}
	{isScriptRunning}
	{comments}
	headingId={HEADING_ID}
	userId={live.setup.writer.id}
	openSuggestions={live.setup.openSuggestions}
	{resolution}
	{checks}
	signatures={signingShown}
	{progress}
/>
