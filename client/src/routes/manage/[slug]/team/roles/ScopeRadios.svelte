<script lang="ts">
	import { onMount } from 'svelte';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import { fieldId } from '$lib/form-fields';
	import type { RoleScope } from '$lib/permissions';
	import ScopeOptionText from './ScopeOptionText.svelte';

	type Props = {
		/** The scope the form arrived with. */
		scope: RoleScope;
		/** Called with every new choice, so the permission boxes can follow it. */
		onChange: (scope: RoleScope) => void;
	};

	let { scope, onChange }: Props = $props();

	/** The two choices, in the words of the spec, with the help line under the second. */
	const OPTIONS: { value: RoleScope; label: string; help: string | null }[] = [
		{ value: 'conference', label: 'The whole conference', help: null },
		{
			value: 'committees',
			label: 'The committees each member is assigned to',
			help: 'Permissions marked per committee apply only in those committees; the others do nothing on this role.'
		}
	];

	// The choice now. A `$derived` can be written to, and starts over from
	// `scope` when the page arrives with a new answer.
	let selectedScope: string = $derived(scope);

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

	function handleValueChange(value: string) {
		onChange(value === 'committees' ? 'committees' : 'conference');
	}

	function radioId(value: RoleScope): string {
		return fieldId(`scope-${value}`);
	}
</script>

<!-- A `<fieldset>` and `<legend>` make a screen reader say "Scope" before each choice. -->
<fieldset class="flex flex-col gap-1">
	<legend class="mb-1 text-dense font-medium text-foreground">Scope</legend>

	{#if isEnhanced}
		<!-- `name` makes shadcn's group send its choice with the form in a hidden field. -->
		<RadioGroup.Root
			name="scope"
			bind:value={selectedScope}
			onValueChange={handleValueChange}
			class="gap-1"
		>
			{#each OPTIONS as option (option.value)}
				<div class="flex min-h-11 items-start gap-3 py-1">
					<RadioGroup.Item id={radioId(option.value)} value={option.value} class="mt-1" />
					<ScopeOptionText forId={radioId(option.value)} label={option.label} help={option.help} />
				</div>
			{/each}
		</RadioGroup.Root>
	{:else}
		{#each OPTIONS as option (option.value)}
			<div class="flex min-h-11 items-start gap-3 py-1">
				<input
					id={radioId(option.value)}
					type="radio"
					name="scope"
					value={option.value}
					checked={option.value === scope}
					class="mt-1 size-4 accent-primary"
				/>
				<ScopeOptionText forId={radioId(option.value)} label={option.label} help={option.help} />
			</div>
		{/each}
	{/if}
</fieldset>
