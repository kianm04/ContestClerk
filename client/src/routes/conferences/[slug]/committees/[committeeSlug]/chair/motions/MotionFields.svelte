<script lang="ts">
	import type { AttendanceStatus, MotionKind, RoomSeat } from '$lib/committee-room';
	import {
		allComposerFields,
		composerFields,
		fieldAfterRaisedBy,
		isPaperPicked,
		type ComposerFieldName
	} from '$lib/motion-composer';
	import { OTHER_DOCUMENT, type MotionFormErrors, type MotionFormValues } from '$lib/motions';
	import type { FloorPaper } from '$lib/papers-on-floor';
	import ComposerField from './ComposerField.svelte';
	import DocumentPaperField from './DocumentPaperField.svelte';
	import RaisedByCombobox from './RaisedByCombobox.svelte';
	import RaisedBySelect from './RaisedBySelect.svelte';

	type Props = {
		/** The kind chosen in the row of kinds, whose fields show. */
		kind: MotionKind;
		/** What the fields hold. */
		values: MotionFormValues;
		/** The message under each field that needs fixing. */
		errors: MotionFormErrors;
		/** Every seat of the committee, which "Raised by" offers. */
		seats: RoomSeat[];
		/** The latest roll call, keyed by seat id; empty before the first. */
		attendance: Record<string, AttendanceStatus>;
		/** The committee's speaking time, which an empty "Each" means. */
		defaultSpeakingSeconds: number;
		/** The approved papers a motion to introduce a document picks from. */
		papers: FloorPaper[];
		/** Whether the page's script runs: then only the kind's fields show, and "Raised by" searches. */
		isScriptRunning: boolean;
		/** Called as a field changes, with its name and new value. */
		onValueChange: (name: keyof MotionFormValues, value: string) => void;
	};

	let {
		kind,
		values,
		errors,
		seats,
		attendance,
		defaultSpeakingSeconds,
		papers,
		isScriptRunning,
		onValueChange
	}: Props = $props();

	/** The "Raised by" field's `id`, which the console's M key and the composer put the cursor in. */
	const RAISED_BY_ID = 'raised-by';

	/*
		With JavaScript the fields follow the chosen kind (`$derived` works them
		out again whenever `kind` changes). Without it nothing could hide them,
		so the three shared fields all show, each saying which kinds use it.
	*/
	// A document picked from "Paper" is named after the paper, so its name is typed only for Other.
	const isPicking = $derived(isPaperPicked(kind, papers));
	const isTopicShown = $derived(!isPicking || values.paperId === OTHER_DOCUMENT);
	const isPaperShown = $derived(isScriptRunning ? isPicking : papers.length > 0);
	const fields = $derived(
		isScriptRunning
			? composerFields(kind, defaultSpeakingSeconds, isTopicShown)
			: allComposerFields(defaultSpeakingSeconds)
	);
	const nextFieldId = $derived(fieldAfterRaisedBy(kind, defaultSpeakingSeconds, papers));
	const raisedByErrorId = $derived(errors.proposedBySeatId ? `${RAISED_BY_ID}-error` : null);

	/** The value a field holds, by its name. */
	function valueOf(name: ComposerFieldName): string {
		return values[name];
	}
</script>

<!--
	"Raised by" first, then the fields the kind asks for, each with its label
	above and its message under it. Without JavaScript "Raised by" is a
	`<select>`; with it, a box that finds a delegation as the chair types.
-->
<div class="flex w-[220px] flex-col gap-1 max-md:w-full">
	<label for={RAISED_BY_ID} class="text-small text-ink-600">Raised by</label>
	{#if isScriptRunning}
		<RaisedByCombobox
			id={RAISED_BY_ID}
			{seats}
			{attendance}
			value={values.proposedBySeatId}
			{nextFieldId}
			errorId={raisedByErrorId}
			onChoose={(value) => onValueChange('proposedBySeatId', value)}
		/>
	{:else}
		<RaisedBySelect
			id={RAISED_BY_ID}
			{seats}
			{attendance}
			value={values.proposedBySeatId}
			errorId={raisedByErrorId}
		/>
	{/if}
	{#if errors.proposedBySeatId}
		<p id={raisedByErrorId} class="text-small text-danger-700">{errors.proposedBySeatId}</p>
	{/if}
</div>

{#if isPaperShown}
	<DocumentPaperField
		{papers}
		value={values.paperId}
		error={errors.paperId}
		isHelpShown={!isScriptRunning}
		onChange={(value) => onValueChange('paperId', value)}
	/>
{/if}

<!-- The `(field.name)` key lets Svelte keep a field the next kind shows too, with what was typed. -->
{#each fields as field (field.name)}
	<ComposerField
		{field}
		value={valueOf(field.name)}
		error={errors[field.name]}
		isHelpShown={!isScriptRunning}
		onInput={(value) => onValueChange(field.name, value)}
	/>
{/each}
