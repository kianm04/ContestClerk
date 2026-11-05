<script lang="ts">
	import FormSelect from '$lib/components/FormSelect.svelte';
	import { PAPER_FIELD_HELP, PAPER_FIELD_ID, documentChoices } from '$lib/motion-composer';
	import type { FloorPaper } from '$lib/papers-on-floor';

	type Props = {
		/** The committee's approved papers, waiting to be introduced. */
		papers: FloorPaper[];
		/** The paper picked so far by its id, "other", or `''` for none. */
		value: string;
		/** The message under the field, or nothing while it is fine. */
		error?: string;
		/** Whether its help line shows, as it does without JavaScript, when every field is drawn. */
		isHelpShown: boolean;
		/** Called with the new pick, so the composer can show the typed name for Other. */
		onChange: (value: string) => void;
	};

	let { papers, value, error, isHelpShown, onChange }: Props = $props();

	const choices = $derived(documentChoices(papers));
</script>

<!--
	"Paper", for a motion to introduce a document: the committee's approved
	papers by what a chair calls them, then Other, for a document typed in by
	name. shadcn's dropdown sends the pick under `paperId`; without JavaScript
	the browser's own dropdown does.
-->
<div class="flex min-w-60 flex-1 flex-col gap-1">
	<label for={PAPER_FIELD_ID} class="text-small text-ink-600">Paper</label>
	<FormSelect
		id={PAPER_FIELD_ID}
		name="paperId"
		{value}
		options={choices}
		placeholder="Pick a paper"
		{onChange}
	/>
	{#if isHelpShown}
		<p class="text-small text-ink-600">{PAPER_FIELD_HELP}</p>
	{/if}
	{#if error}
		<p class="text-small text-danger-700">{error}</p>
	{/if}
</div>
