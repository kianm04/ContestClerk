<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import type { Component } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import FieldError from '$lib/components/FieldError.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { fieldErrorId } from '$lib/form-fields';

	type Props = {
		/** The field's `name` and `id`, such as `websiteUrl`. */
		field: string;
		label: string;
		/** The icon inside the field's left end: a lucide icon, or `InstagramIcon`. */
		icon: Component<{ class?: string }>;
		/** An icon before the label's words, as the design draws beside "Website". */
		labelIcon?: LucideIcon;
		/** The label's own spacing, such as Instagram's `pl-10.5` to line up with "Website". */
		labelClass?: string;
		value: string;
		error: string | undefined;
		type?: 'text' | 'email';
		inputmode?: HTMLInputAttributes['inputmode'];
		autocomplete?: HTMLInputAttributes['autocomplete'];
		placeholder: string;
	};

	// `$bindable()` lets the parent write `bind:value={websiteUrl}`. `icon: Icon`
	// renames it, because a component has to start with a capital to be drawn.
	let {
		field,
		label,
		icon: Icon,
		labelIcon: LabelIcon,
		labelClass = '',
		value = $bindable(),
		error,
		type = 'text',
		inputmode,
		autocomplete,
		placeholder
	}: Props = $props();
</script>

<!--
	One row of the links: the label on the left, the field on the right.
	`contents` lets the two take the parent grid's columns directly, so the
	three rows line up. The field's icon sits over its left end, which the
	field's 46 pixel padding keeps clear of the words.
-->
<div class="contents">
	<Label for={field} class="gap-4.5 fs-16 lh-22 font-semibold text-creation-ink-900 {labelClass}">
		{#if LabelIcon}<LabelIcon
				class="size-6 shrink-0 text-creation-ink-650"
				aria-hidden="true"
			/>{/if}
		{label}
	</Label>
	<div class="min-w-0">
		<div class="relative flex items-center">
			<Icon class="pointer-events-none absolute left-3.5 size-4.5 text-creation-ink-650" />
			<Input
				id={field}
				name={field}
				{type}
				{inputmode}
				{autocomplete}
				{placeholder}
				class="h-9 rounded-md border-creation-input-border bg-white pr-3.5 pl-11.5 fs-15 text-creation-ink-450 placeholder:text-creation-ink-100 max-lg:h-11 md:fs-15"
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={error ? fieldErrorId(field) : undefined}
				bind:value
			/>
		</div>
		<FieldError id={fieldErrorId(field)} message={error} />
	</div>
</div>
