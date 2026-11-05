<script lang="ts">
	import PaperMargin from '$lib/components/paper-margin/PaperMargin.svelte';
	import type { PaperPerson } from '$lib/committee-papers';
	import type { CrisisPanel as CrisisAnswerPanel } from '$lib/crisis-papers';
	import type { PaperThread } from '$lib/paper-comments';
	import type { PaperMargin as Margin } from '$lib/paper-margin-state.svelte';
	import ClosedThreads from './ClosedThreads.svelte';
	import CrisisPanel from './CrisisPanel.svelte';
	import WithTheDaisPanel from './WithTheDaisPanel.svelte';
	import type { PaperComments } from './paper-resolution';

	type Props = {
		/** For a paper the crisis staff decide: where it stands with them, in place of the dais's panel. */
		crisisPanel: CrisisAnswerPanel | null;
		/** What the dais does next, for the paper's authors alone, or `null`. */
		panel: { title: string; sentence: string } | null;
		/** The margin, for a reader who may comment, or `null`. */
		margin: Margin | null;
		comments: (PaperComments & { userId: string }) | null;
		people: PaperPerson[];
		isScriptRunning: boolean;
		/** An introduced paper's threads, closed and kept to read, or `null`. */
		closedThreads: PaperThread[] | null;
	};

	let { crisisPanel, panel, margin, comments, people, isScriptRunning, closedThreads }: Props =
		$props();
</script>

<!--
	What sits beside the paper's text for a reader, on the right from `lg`
	up and under the text before that: where it stands with the crisis staff
	or the dais, the
	margin while it is open for comments, or its closed threads once it has
	been introduced. Nothing at all when there is none of these.
-->
{#if crisisPanel || panel || (margin && comments) || closedThreads}
	<div class="flex min-w-0 flex-col gap-10 md:col-start-2 lg:col-start-3 lg:row-start-1">
		{#if crisisPanel}
			<CrisisPanel panel={crisisPanel} />
		{:else if panel}
			<WithTheDaisPanel title={panel.title} sentence={panel.sentence} />
		{/if}
		{#if margin && comments}
			<PaperMargin
				{margin}
				paperUrl={comments.paperUrl}
				{people}
				userId={comments.userId}
				timeZone={comments.timeZone}
				editingCommentId={comments.editingCommentId}
				{isScriptRunning}
			/>
		{/if}
		{#if closedThreads}
			<ClosedThreads threads={closedThreads} />
		{/if}
	</div>
{/if}
