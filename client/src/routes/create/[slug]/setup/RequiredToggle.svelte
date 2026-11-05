<script lang="ts">
	import { RadioGroup } from '$lib/components/ui/radio-group';
	import RadioItem from './RadioItem.svelte';

	type Props = {
		/** `required` or `optional`, as the form sends it. */
		required: string;
	};

	// `$bindable()` lets the type fields write `bind:required`, which the preview follows.
	let { required = $bindable() }: Props = $props();

	const CHOICES = [
		{ value: 'optional', label: 'Optional' },
		{ value: 'required', label: 'Required' }
	];
</script>

<!--
	shadcn's `RadioGroup`, drawn as one two-part control 40 pixels tall: the
	chosen half takes a 2 pixel blue border, a full corner and a pale fill, and
	sits over its neighbour; the other half keeps its hairline and its outer
	corner. `name` puts the choice in a hidden field the form sends. The
	`has-[[data-state=checked]]:` classes style a half from the radio inside it.
-->
<div class="min-w-0">
	<p id="required-title" class="fs-14 lh-20 font-semibold text-creation-ink-900">Required</p>
	<RadioGroup
		name="required"
		aria-labelledby="required-title"
		class="flex gap-0 pt-1.75"
		bind:value={required}
	>
		{#each CHOICES as choice, index (choice.value)}
			<label
				class={[
					'group relative flex h-10 min-w-0 flex-1 cursor-pointer items-center gap-2.5 border border-creation-input-border bg-white px-3 has-[[data-state=checked]]:z-1 has-[[data-state=checked]]:rounded-md has-[[data-state=checked]]:border-2 has-[[data-state=checked]]:border-creation-blue-border has-[[data-state=checked]]:bg-creation-selected max-lg:h-11',
					index === 0 ? 'rounded-l-md' : '-ml-px rounded-r-md'
				]}
			>
				<RadioItem value={choice.value} class="size-4.5" />
				<span
					class="fs-13 font-medium text-creation-ink-500 group-has-[[data-state=checked]]:font-semibold group-has-[[data-state=checked]]:text-creation-blue"
				>
					{choice.label}
				</span>
			</label>
		{/each}
	</RadioGroup>
	<p class="mt-2 fs-12 lh-16 text-creation-ink-225">
		{required === 'required'
			? 'Applicants must answer this question.'
			: 'Applicants can choose to skip this question.'}
	</p>
</div>
