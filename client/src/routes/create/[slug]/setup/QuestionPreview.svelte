<script lang="ts">
	import { parseOptions } from '$lib/application-questions';
	import QuestionPreviewAnswer from './QuestionPreviewAnswer.svelte';

	type Props = {
		label: string;
		helpText: string;
		type: string;
		/** One option per line. */
		options: string;
		/** Named in the example question shown before anything is typed. */
		conferenceName: string;
		isRequired: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { label, helpText, type, options, conferenceName, isRequired }: Props = $props();

	// `$derived` works these out again whenever a field changes. Before anything
	// is typed, the card shows the board's example, so it is never an empty box.
	const choices = $derived(parseOptions(options));
	const shownLabel = $derived(
		label === '' ? `Why do you want to participate in ${conferenceName}?` : label
	);
	const shownHelp = $derived(
		label === '' && helpText === ''
			? 'Please share your motivation, relevant experience and what you hope to achieve at this conference.'
			: helpText
	);
</script>

<!--
	The question as an applicant will meet it, drawn again as the organiser
	types: the pale blue column of the board, with the white card inside.
-->
<section
	aria-labelledby="question-preview-title"
	class="min-w-0 flex-1 rounded-xl bg-creation-note px-5 pt-6 pb-5 lg:h-132.75"
>
	<h3 id="question-preview-title" class="fs-14 lh-20 font-semibold text-creation-ink-950">
		Preview for applicants
	</h3>
	<p class="mt-1 fs-13 lh-18 text-creation-ink-450">
		This is how your question will appear in the application form.
	</p>
	<div class="mt-4 rounded-lg border border-creation-panel-border bg-white p-4.5">
		<p class="fs-14 lh-17 font-semibold text-creation-ink-950">
			{shownLabel}
			{#if isRequired}<span class="text-creation-red-bright" aria-label="required">*</span>{/if}
		</p>
		{#if shownHelp !== ''}
			<p class="mt-2 fs-12.5 lh-18 text-creation-ink-450">{shownHelp}</p>
		{/if}
		<QuestionPreviewAnswer {type} {choices} />
	</div>
</section>
