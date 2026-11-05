<script lang="ts">
	import FieldError from '$lib/components/FieldError.svelte';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { fieldErrorId } from '$lib/form-fields';

	type Props = {
		/** The textarea's `id` and the `name` it is sent as. */
		id: string;
		label: string;
		/** Grey words after the label, such as "(optional)". */
		labelNote?: string;
		value: string;
		maxLength: number;
		placeholder: string;
		/** The box's height in the design's pixels: `h-18` for 72. */
		heightClass: string;
		error?: string;
		/** The distance above, such as `mt-4.5`. */
		class?: string;
	};

	// `$bindable()` lets the dialog write `bind:value`, which the preview follows.
	let {
		id,
		label,
		labelNote,
		value = $bindable(),
		maxLength,
		placeholder,
		heightClass,
		error,
		class: className
	}: Props = $props();
</script>

<!-- A text field of the Add question board: the label, the box, and the count under it on the right. -->
<div class={className}>
	<Label for={id} class="block fs-14 lh-20 font-semibold text-creation-ink-900">
		{label}
		{#if labelNote}<span class="font-normal text-creation-ink-225">{labelNote}</span>{/if}
	</Label>
	<Textarea
		{id}
		name={id}
		maxlength={maxLength}
		{placeholder}
		class="mt-2 {heightClass} field-sizing-fixed resize-y rounded-md border-creation-input-border bg-white px-3.5 py-3 placeholder:text-creation-ink-325"
		aria-describedby={error ? fieldErrorId(id) : undefined}
		bind:value
	/>
	<p class="mt-1 text-right fs-12 lh-18 text-creation-ink-300 tabular-nums">
		{value.length}/{maxLength}
	</p>
	<FieldError id={fieldErrorId(id)} message={error} />
</div>
