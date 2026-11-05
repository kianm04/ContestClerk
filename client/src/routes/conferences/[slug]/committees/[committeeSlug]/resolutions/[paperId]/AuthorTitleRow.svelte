<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { paperMetaLine, paperSaveWord, type PaperName } from '$lib/committee-papers';
	import type { LivePaper } from '$lib/paper-live.svelte';
	import type { PaperMargin } from '$lib/paper-margin-state.svelte';
	import type { SigningView } from '$lib/paper-signing';
	import { authorSteps } from '$lib/paper-submitting';
	import type { PaperSupport } from '$lib/paper-support';
	import { paperStandingWord, submitWords } from '$lib/crisis-papers';
	import PaperTitleRow from './PaperTitleRow.svelte';
	import SubmitPaperDialog from './SubmitPaperDialog.svelte';
	import type { PaperProgress } from './paper-resolution';

	type Props = {
		paper: PaperName & { title: string; topic: string | null };
		headingId: string;
		livePaper: LivePaper | null;
		/** The margin, once the page's script runs: the mode, and the suggestions open. */
		margin: PaperMargin | undefined;
		/** What the page says about signing, for a draft resolution or a directive; else `null`. */
		signing: SigningView | null;
		support: PaperSupport | null;
		/** True for an author, who may submit the paper while it is being written. */
		canSubmit: boolean;
		progress: PaperProgress;
		/** The suggestions the stored paper holds, for the page before its script runs. */
		openSuggestions: number;
		/** The paper's page and the conference's time zone. */
		comments: { paperUrl: ResolvedPathname; timeZone: string };
		/** True when the address asks for "Submit to the dais" (`?submit=1`). */
		isSubmitOpen: boolean;
		/** The same page asking to submit the paper. */
		submitUrl: ResolvedPathname;
	};

	let {
		paper,
		headingId,
		livePaper,
		margin,
		signing,
		support,
		canSubmit,
		progress,
		openSuggestions,
		comments,
		isSubmitOpen,
		submitUrl
	}: Props = $props();

	// "Saved" ends the line only while the paper saves by itself; without JavaScript "Save changes" does.
	const saveWord = $derived(margin && livePaper ? paperSaveWord(livePaper.save.status) : null);
	// "Returned 15 March, 09:46" once the dais sent it back, "Sent … · With the crisis staff", else who may see it.
	const progressWord = $derived(
		paperStandingWord(
			{ kind: paper.kind, ...progress },
			progress.decision,
			progress.answer,
			comments.timeZone
		)
	);
	const metaLine = $derived(paperMetaLine(paper, saveWord, progressWord ?? signing?.stateWord));
	const steps = $derived(authorSteps(paper.kind, canSubmit, signing, support));
	const suggestionCount = $derived(margin?.suggestionCount ?? openSuggestions);
</script>

<!-- An author's title row: the paper's next step, and the dialog that submits it. -->
<PaperTitleRow
	title={paper.title}
	{headingId}
	{metaLine}
	writers={livePaper?.writers}
	status={livePaper?.channelStatus}
	{margin}
	signing={steps.signing}
	submitHref={steps.isSubmitShown ? submitUrl : null}
	{openSuggestions}
	submitLabel={submitWords(paper.kind).button}
/>

{#if isSubmitOpen}
	<SubmitPaperDialog
		title={paper.title}
		kind={paper.kind}
		isOpenForSignatures={signing?.isOpen ?? false}
		openSuggestions={suggestionCount}
		save={livePaper?.save ?? null}
		closeHref={comments.paperUrl}
	/>
{/if}
