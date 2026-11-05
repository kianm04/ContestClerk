<script lang="ts">
	import Info from '@lucide/svelte/icons/info';
	import type { Snippet } from 'svelte';
	import FieldError from '$lib/components/FieldError.svelte';
	import { creationClasses } from '$lib/creation-classes';
	import { fieldErrorId, fieldHelpId } from '$lib/form-fields';

	type Props = {
		/** The `id` of the input inside, which the label points at. */
		id: string;
		label: string;
		/** A line under the field in small grey text. */
		help?: string;
		error?: string;
		/** Under the field on the right, such as "0 / 4000". */
		counter?: string;
		/** A section's own title as the label, 17 pixels in ink, as the applications dialog draws it. */
		isSection?: boolean;
		/** Draws the red star after the label for a field the form cannot go without. */
		isRequired?: boolean;
		/** The small blue info circle before the help line, as under Room. */
		hasHelpIcon?: boolean;
		/** That circle's size when not 15, such as `size-4`. */
		helpIconClass?: string;
		/** Anything about the whole field, such as its distance from the row above. */
		class?: string;
		/** The label's size when not 16 over 22, such as `fs-14 lh-20`. */
		labelClass?: string;
		/** The input's distance under the label when not 6, such as `mt-0.75`. */
		controlClass?: string;
		/** The help line's size and distance when not 12 over 16, 6 under the input. */
		helpClass?: string;
		/** The counter's distance under the input when not 6. */
		counterClass?: string;
		children: Snippet;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	// `children` is whatever the parent writes between the tags: the input.
	let {
		id,
		label,
		help,
		error,
		counter,
		isSection = false,
		isRequired = false,
		hasHelpIcon = false,
		helpIconClass,
		class: className,
		labelClass,
		controlClass,
		helpClass,
		counterClass,
		children
	}: Props = $props();
</script>

<!--
	One field of a Setup dialog at the designs' sizes: the semibold label, the
	input under it, then the help line and the counter on the right. The input
	names `fieldHelpId(id)` and `fieldErrorId(id)` in its `aria-describedby`.
	The star is hidden from screen readers, which hear the input's
	`aria-required` instead; the server, not the browser, refuses a missing
	value, so the refusal reads the same with or without JavaScript.
-->
<div class={creationClasses('flex min-w-0 flex-col', className)}>
	<label
		for={id}
		class={creationClasses(
			'block fs-16 lh-22 font-semibold',
			isSection ? 'fs-17 text-creation-ink-950' : 'text-creation-ink-900',
			labelClass
		)}
	>
		{label}
		{#if isRequired}
			<span class="text-creation-red-bright" aria-hidden="true">*</span>
		{/if}
	</label>
	<div class={creationClasses('mt-1.5', controlClass)}>
		{@render children()}
	</div>
	{#if help}
		<p
			id={fieldHelpId(id)}
			class={creationClasses(
				'mt-1.5 flex items-center gap-2 fs-12 lh-16 text-creation-ink-225',
				helpClass
			)}
		>
			{#if hasHelpIcon}
				<Info
					class={creationClasses('size-3.75 shrink-0 text-creation-blue', helpIconClass)}
					aria-hidden="true"
				/>
			{/if}
			{help}
		</p>
	{/if}
	{#if counter}
		<p
			class={creationClasses(
				'mt-1.5 text-right fs-15 lh-20 text-creation-ink-300 tabular-nums',
				counterClass
			)}
		>
			{counter}
		</p>
	{/if}
	<FieldError id={fieldErrorId(id)} message={error} />
</div>
