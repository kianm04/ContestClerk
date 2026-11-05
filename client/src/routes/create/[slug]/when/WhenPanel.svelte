<script lang="ts">
	import Calendar from '@lucide/svelte/icons/calendar';
	import CreationPanel from '$lib/components/creation/CreationPanel.svelte';
	import type { PrefillSource } from '$lib/creation-draft';
	import type { WhenErrors } from '$lib/creation-when';
	import DateRangeFields from './DateRangeFields.svelte';
	import SuggestedDatesCard from './SuggestedDatesCard.svelte';

	type Suggestion = {
		startDate: string;
		endDate: string;
		range: string;
		span: string;
		previousName: string;
		previousBannerPath: string | null;
	};

	type Props = {
		startDate: string;
		endDate: string;
		isTimesTba: boolean;
		startTime: string;
		endTime: string;
		errors: WhenErrors;
		/** Next year's dates from the previous edition, or `null` without one. */
		suggestion: Suggestion | null;
		/** Where the saved first day came from. */
		startDateSource: PrefillSource | undefined;
		/** Today, as "2026-10-04". */
		today: string;
		/** The id of the form "Use these dates" sends. */
		suggestionFormId: string;
		/** Called when the calendar picks a range. */
		onPick: () => void;
	};

	let {
		startDate = $bindable(),
		endDate = $bindable(),
		isTimesTba = $bindable(),
		startTime = $bindable(),
		endTime = $bindable(),
		errors,
		suggestion,
		startDateSource,
		today,
		suggestionFormId,
		onPick
	}: Props = $props();

	// The suggestion stays on offer unless the organiser typed exactly those dates.
	const isSuggestionShown = $derived(
		suggestion !== null &&
			!(
				startDateSource === 'user' &&
				startDate === suggestion.startDate &&
				endDate === suggestion.endDate
			)
	);
</script>

<!--
	The design's first panel: its padding is 18, 20 and 16 at the foot
	(`pb-4`); the suggestion tucks under the title row, and the calendar and
	fields come 16 pixels under it.
-->
<CreationPanel
	title="When is this conference happening?"
	description={suggestion
		? `We've suggested dates based on your previous ${suggestion.previousName} conference.`
		: 'Pick the first and last day. You can change them later.'}
	icon={Calendar}
	class="pb-4"
>
	{#if isSuggestionShown && suggestion}
		<SuggestedDatesCard {suggestion} formId={suggestionFormId} />
	{/if}
	<DateRangeFields
		bind:startDate
		bind:endDate
		bind:isTimesTba
		bind:startTime
		bind:endTime
		{errors}
		suggestedDate={suggestion?.startDate ?? null}
		{today}
		{onPick}
	/>
</CreationPanel>
