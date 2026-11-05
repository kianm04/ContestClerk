<script lang="ts">
	import { MOTION_TOPIC_MAX_LENGTH } from '$lib/motions';
	import type { ComposerField } from '$lib/motion-composer';

	type Props = {
		/** Which field, with its label and placeholder (`$lib/motion-composer.ts`). */
		field: ComposerField;
		/** What is typed in it. */
		value: string;
		/** The message under it, or nothing while it is fine. */
		error?: string;
		/** Whether its help line shows, as it does without JavaScript, when every field is drawn. */
		isHelpShown: boolean;
		/** Called with the new text as the chair types. */
		onInput: (value: string) => void;
	};

	let { field, value, error, isHelpShown, onInput }: Props = $props();

	const errorId = $derived(`${field.id}-error`);
	const helpId = $derived(`${field.id}-help`);
	const describedBy = $derived(describedByIds());
	/** The ids of the lines under the field that a screen reader reads after its name, or nothing. */
	function describedByIds(): string | undefined {
		const ids: string[] = [];

		if (error) ids.push(errorId);
		if (isHelpShown && field.help) ids.push(helpId);

		return ids.length > 0 ? ids.join(' ') : undefined;
	}

	/** A text field grows to fill the row; a time field is the study's narrow 72px box, wider with its help line. */
	function fieldWidth(): string {
		if (field.size === 'text') return isHelpShown ? 'min-w-60 flex-1' : 'min-w-0 flex-1';

		return isHelpShown ? 'w-44 max-md:w-full' : 'w-[72px] max-md:w-full';
	}

	// Without JavaScript the help lines need more room, so the fields are wider and the row wraps.
	const widthClass = $derived(fieldWidth());
</script>

<!--
	One field of the composer: its label above it and its message under it.
	Times are typed the MUN way ("10", "1:30", "90s"), so the box is plain text;
	empty means the default its placeholder shows.
-->
<div class="flex flex-col gap-1 {widthClass}">
	<label for={field.id} class="text-small text-ink-600">{field.label}</label>
	<input
		id={field.id}
		name={field.name}
		type="text"
		autocomplete="off"
		maxlength={field.size === 'text' ? MOTION_TOPIC_MAX_LENGTH : undefined}
		placeholder={field.placeholder}
		{value}
		oninput={(event) => onInput(event.currentTarget.value)}
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={describedBy}
		class="h-10 w-full rounded-control border border-line bg-surface px-3 placeholder:text-ink-400 focus:border-transparent focus:ring-2 focus:ring-brand-500 max-md:h-11 {field.size ===
		'time'
			? 'text-center tabular-nums'
			: ''}"
	/>
	{#if isHelpShown && field.help}
		<p id={helpId} class="text-small text-ink-600">{field.help}</p>
	{/if}
	{#if error}
		<p id={errorId} class="text-small text-danger-700">{error}</p>
	{/if}
</div>
