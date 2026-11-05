<script lang="ts">
	import { onMount } from 'svelte';
	import FieldError from '$lib/components/FieldError.svelte';
	import { Label } from '$lib/components/ui/label';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import { fieldErrorId, fieldId, labelClasses } from '$lib/form-fields';
	import { AMENDMENT_ACTION_OPTIONS } from '$lib/paper-amendments';

	type Props = {
		/** The choice the form arrived with: `add`, `change` or `strike`. */
		action: string;
		error?: string;
		/** Called with every new choice, so the clause dropdown can follow it. */
		onChange: (action: string) => void;
	};

	let { action, error, onChange }: Props = $props();

	// The choice now. A `$derived` can be written to, and starts over from
	// `action` when the page arrives with a new answer.
	let selectedAction: string = $derived(action);

	/*
		Whether the page has come to life. Until then, and without JavaScript, the
		browser's own radios are on screen and are sent with the form; `onMount`
		only runs in the browser, and then shadcn's take their place.
		`FormSelect` explains the pattern in full.
	*/
	let isEnhanced = $state(false);

	onMount(() => {
		isEnhanced = true;
	});

	function radioId(value: string): string {
		return fieldId(`action-${value}`);
	}
</script>

<!-- A `<fieldset>` and `<legend>` make a screen reader say the question before each choice. -->
<fieldset aria-describedby={error ? fieldErrorId('action') : undefined}>
	<legend class={labelClasses(true)}>What the amendment does</legend>

	{#if isEnhanced}
		<!-- `name` makes shadcn's group send its choice with the form in a hidden field. -->
		<RadioGroup.Root
			name="action"
			bind:value={selectedAction}
			onValueChange={onChange}
			class="gap-0"
		>
			{#each AMENDMENT_ACTION_OPTIONS as option (option.value)}
				<div class="flex min-h-11 items-center gap-3">
					<RadioGroup.Item id={radioId(option.value)} value={option.value} />
					<Label for={radioId(option.value)} class="text-body font-normal">{option.label}</Label>
				</div>
			{/each}
		</RadioGroup.Root>
	{:else}
		{#each AMENDMENT_ACTION_OPTIONS as option (option.value)}
			<div class="flex min-h-11 items-center gap-3">
				<input
					id={radioId(option.value)}
					type="radio"
					name="action"
					value={option.value}
					checked={option.value === action}
					class="size-4 accent-primary"
				/>
				<Label for={radioId(option.value)} class="text-body font-normal">{option.label}</Label>
			</div>
		{/each}
	{/if}

	<FieldError id={fieldErrorId('action')} message={error} />
</fieldset>
