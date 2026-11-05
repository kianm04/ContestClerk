<script lang="ts">
	import Globe from '@lucide/svelte/icons/globe';
	import UsersRound from '@lucide/svelte/icons/users-round';
	import IconCircle from '$lib/components/creation/IconCircle.svelte';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import type { LaunchChoices } from '$lib/creation-readiness';

	type Props = {
		/** From `launchChoices()` in `$lib/creation-readiness.ts`. */
		choices: LaunchChoices;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { choices }: Props = $props();

	/** "Make the page public now. Applications stay closed." as its two sentences. */
	function sentences(text: string): string[] {
		return text.split(/(?<=\.)\s+/);
	}
</script>

<!--
	The ways to launch, as the design's two 88 pixel cards (420 and 436 wide).
	shadcn's `RadioGroup` draws the round button at each card's top right and,
	because it is given `name="choice"`, keeps a hidden input in the form with
	the picked value, so the action reads it like any field. The first option
	is picked to begin with, because publishing alone cannot surprise anybody;
	without JavaScript that first option is what is sent.

	Each card is a `<label for>` its round button, so a click anywhere on it
	picks it. The button carries `data-state="checked"` once picked; the card's
	`has-[[data-state=checked]]:` classes follow it, so the blue border and
	pale fill move with the choice. The chosen card's border is 2 pixels: a
	1 pixel ring inside the 1 pixel border, so the words do not move.
-->
<RadioGroup.Root
	name="choice"
	value={choices.options[0]?.value}
	aria-label="How to launch"
	class="mt-1.25 grid gap-4 lg:grid-cols-[420fr_436fr]"
>
	<!-- The `(option.value)` key lets Svelte keep each card's element as the list redraws. -->
	{#each choices.options as option (option.value)}
		{@const id = `launch-choice-${option.value}`}
		<label
			for={id}
			class="group relative flex min-h-22 cursor-pointer items-start gap-7 rounded-lg border border-creation-card-border bg-white pt-3.25 pr-10 pb-3 pl-4 transition-colors duration-150 has-[[data-state=checked]]:border-creation-blue-border has-[[data-state=checked]]:bg-creation-note has-[[data-state=checked]]:ring-1 has-[[data-state=checked]]:ring-creation-blue-border has-[[data-state=checked]]:ring-inset lg:h-22"
		>
			<IconCircle
				icon={option.value === 'publish_and_open' ? UsersRound : Globe}
				class="mt-0.5 group-has-[[data-state=checked]]:bg-creation-hover"
			/>
			<span class="min-w-0">
				<span id="{id}-label" class="block fs-15 lh-20 font-semibold text-creation-ink-950"
					>{option.label}</span
				>
				<!-- From a laptop up each sentence starts its own line, as the design breaks them. -->
				<span class="mt-0.5 block fs-14 lh-19 text-creation-ink-450">
					{#each sentences(option.description) as sentence, index (index)}
						<!-- The space keeps the sentences apart on a phone, where they run on. -->
						<span class="lg:block">{`${sentence} `}</span>
					{/each}
				</span>
			</span>
			<RadioGroup.Item
				{id}
				value={option.value}
				aria-labelledby="{id}-label"
				class="absolute top-3.5 right-3.25 size-4.5 border-2 border-creation-radio-border bg-white data-[state=checked]:border-creation-blue data-[state=checked]:bg-creation-blue [&_svg]:size-1.5 [&_svg]:fill-white [&_svg]:text-white"
			/>
		</label>
	{/each}
</RadioGroup.Root>
{#if choices.note}
	<p class="mt-2 fs-13 lh-18 text-creation-ink-375">{choices.note}</p>
{/if}
