<script lang="ts">
	import ReadOnlyNote from '$lib/components/manage/ReadOnlyNote.svelte';
	import type { ReviewPanel, ReviewPanelRefusal } from '$lib/application-panel';
	import ReviewPanelActions from './ReviewPanelActions.svelte';
	import ReviewPanelFacts from './ReviewPanelFacts.svelte';
	import ReviewPanelHeader from './ReviewPanelHeader.svelte';

	type Props = {
		/** The one application the panel shows, as `load` read it. */
		panel: ReviewPanel;
		/** The last refused post from the panel, or null. */
		refusal: ReviewPanelRefusal | null;
		/**
		 * Whether the reader holds `decide_applications`. Without it the panel
		 * shows the application and its note, and nothing to press.
		 */
		canDecide: boolean;
	};

	let { panel, refusal, canDecide }: Props = $props();

	/*
		A refusal belongs to the application it was about, so it is dropped once the
		panel shows another one. `$derived` works these out again whenever the panel
		or the refusal changes.
	*/
	const ownRefusal = $derived(refusal?.applicationId === panel.applicationId ? refusal : null);
	const decisionRefusal = $derived(ownRefusal?.part === 'decision' ? ownRefusal : null);
	const noteRefusal = $derived(ownRefusal?.part === 'note' ? ownRefusal : null);
</script>

<!--
	Drawn only from `xl` up, where there is room beside the table. Below that a
	row's name leads to the review page instead. `aria-label` names the `<aside>`,
	so a screen reader can jump straight to it.
-->
<aside aria-label="Application review" class="hidden border-l border-border pl-6 xl:block">
	<!--
		`{#key}` throws away everything inside it and draws it fresh whenever
		`panel.applicationId` changes, so a seat chosen or a note typed for one
		applicant is never carried over to the next.
	-->
	{#key panel.applicationId}
		<ReviewPanelHeader
			applicantName={panel.applicantName}
			metaLine={panel.metaLine}
			previousHref={panel.links.previousHref}
			nextHref={panel.links.nextHref}
		/>

		<ReviewPanelFacts facts={panel.facts} motivation={panel.motivation} />

		{#if canDecide}
			<ReviewPanelActions {panel} {decisionRefusal} {noteRefusal} />
		{:else}
			<div class="mt-6">
				<ReadOnlyNote label="Note for organisers" text={panel.internalNote} />
			</div>
		{/if}

		<a
			href={panel.links.fullApplicationHref}
			class="mt-4 inline-block text-dense font-medium text-link hover:underline"
		>
			Open the full application
		</a>
	{/key}
</aside>
