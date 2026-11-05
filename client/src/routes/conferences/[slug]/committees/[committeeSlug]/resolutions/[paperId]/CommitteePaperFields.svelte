<script lang="ts">
	import DraftProblem from '$lib/components/paper-writing/DraftProblem.svelte';
	import PaperEditor from '$lib/components/paper-writing/PaperEditor.svelte';
	import { Button } from '$lib/components/ui/button';
	import { plainFormSuggestionsMessage } from '$lib/paper-comments';
	import type { LivePaper } from '$lib/paper-live.svelte';
	import type { PaperMargin } from '$lib/paper-margin-state.svelte';
	import type { ResolutionChecks } from '$lib/resolution-checks-state.svelte';
	import type { ResolutionHeading } from '$lib/resolution-heading';

	type Props = {
		/** The paper written live, or `null` while the server draws the page. */
		livePaper: LivePaper | null;
		/** The id of the paper's title, which names the editor for a screen reader. */
		headingId: string;
		/** "The working paper's text", for a screen reader, and in grey on an empty paper. */
		label: string;
		/** What the editor starts with. */
		startMarkdown: string;
		/** The revision "Save changes" saves over without JavaScript. */
		revision: number;
		/** True once the page's script runs, when the paper saves by itself. */
		isScriptRunning: boolean;
		/** The comments and suggestions beside the text, which follow the editor. */
		margin: PaperMargin;
		/** How many suggestions the stored paper holds, which the plain form cannot save over. */
		openSuggestions: number;
		/** A draft resolution's or a directive's clauses and heading, for the editor. */
		resolution?: { checks: ResolutionChecks; heading: ResolutionHeading; isDraft: boolean };
	};

	let {
		livePaper,
		headingId,
		label,
		startMarkdown,
		revision,
		isScriptRunning,
		margin,
		openSuggestions,
		resolution
	}: Props = $props();

	const PROBLEM_TITLE = 'Your changes were not saved';

	function handleTryAgain() {
		void livePaper?.save.saveNow();
	}

	function handleReload() {
		location.reload();
	}
</script>

<!--
	The paper's text. It saves by itself while the page's script runs; without
	JavaScript the editor is a plain box and "Save changes" posts it. This form
	holds only the text, because a form cannot hold another and the paper's
	people beside it have forms of their own.
-->
<form method="post" action="?/saveDraft">
	<input type="hidden" name="revision" value={revision} />
	<PaperEditor
		name="body"
		initialMarkdown={startMarkdown}
		labelledBy={headingId}
		placeholder={label}
		live={livePaper?.editorDocument}
		look="committee-paper"
		sheetLabel={label}
		margin={livePaper ? margin : undefined}
		{resolution}
	/>

	{#if livePaper?.save.isReplaced && livePaper.save.failureMessage !== null}
		<div class="mt-4">
			<DraftProblem
				title={PROBLEM_TITLE}
				message={livePaper.save.failureMessage}
				actionLabel="Reload"
				onAction={handleReload}
			/>
		</div>
	{:else if livePaper?.save.status === 'failed' && livePaper.save.failureMessage !== null}
		<div class="mt-4">
			<DraftProblem
				title={PROBLEM_TITLE}
				message={livePaper.save.failureMessage}
				actionLabel="Try again"
				onAction={handleTryAgain}
			/>
		</div>
	{/if}

	{#if !isScriptRunning && openSuggestions > 0}
		<p class="mt-4 max-w-prose text-small text-muted-foreground">
			{plainFormSuggestionsMessage(openSuggestions)}
		</p>
	{:else if !isScriptRunning}
		<div class="mt-4">
			<Button type="submit" variant="outline" size="lg" class="max-lg:h-11">Save changes</Button>
		</div>
	{/if}
</form>
