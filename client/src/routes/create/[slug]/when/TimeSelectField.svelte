<script lang="ts">
	import Clock from '@lucide/svelte/icons/clock';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { announceChange } from './announce-change';
	import { bothClocks, timeOptions } from './field-display';
	import { DROPDOWN_CLASSES } from './where-fields';

	type Props = {
		/** The hidden field's `name`, and the button's `id`: `startTime` or `endTime`. */
		name: string;
		label: string;
		/** The time picked, as "10:00", or "". */
		value: string;
		isDisabled: boolean;
	};

	let { name, label, value = $bindable(), isDisabled }: Props = $props();

	// The quarter hours, plus the saved time if it falls between them.
	const options = $derived(timeOptions(value));
	let wrapper: HTMLElement | undefined = $state(); // set by `bind:this`
</script>

<!--
	A daily time as the design draws it: a 40 pixel dropdown with a clock, the
	time written both ways and a chevron. shadcn's `Select` with a `name`
	keeps a hidden input of that name, which is what the form sends; while the
	times are not decided it is disabled, and a disabled field is not sent.
-->
<div class="flex min-w-0 flex-col" bind:this={wrapper}>
	<Label for={name} class="fs-16 lh-22 font-semibold text-creation-ink-900">{label}</Label>
	<Select.Root
		type="single"
		{name}
		bind:value
		disabled={isDisabled}
		onValueChange={() => announceChange(wrapper)}
	>
		<Select.Trigger
			id={name}
			class="{DROPDOWN_CLASSES} mt-1.5 h-10 rounded-md data-[size=default]:h-10 max-lg:data-[size=default]:h-11 [&>svg:last-child]:size-4.5 [&>svg:last-child]:text-current"
		>
			<Clock class="size-5 shrink-0 text-creation-ink-650" aria-hidden="true" />
			<span class="min-w-0 flex-1 truncate tabular-nums">{bothClocks(value) || 'Pick a time'}</span>
		</Select.Trigger>
		<Select.Content class="max-h-72">
			<!-- `(option.value)` is the key: Svelte uses it to keep each choice in its place. -->
			{#each options as option (option.value)}
				<Select.Item value={option.value} label={option.label} class="fs-15 tabular-nums" />
			{/each}
		</Select.Content>
	</Select.Root>
</div>
