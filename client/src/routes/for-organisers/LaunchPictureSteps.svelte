<script lang="ts">
	import Checkmark from 'carbon-icons-svelte/lib/Checkmark.svelte';
	import { LAUNCH_DONE_STEPS } from '$lib/organiser-start';
</script>

<!--
	The right half of the launch picture: the five steps of setting up a
	conference, the first four ticked and "Launch" ringed as the current one,
	then the two ways of publishing with "Publish and open applications"
	chosen, and the dark blue Publish button. It is part of a picture, so the
	options and the button are drawn with `<span>`s and cannot be pressed.

	Each step's name is its own `{#each}` key, being different for every step.
	The radio dots are drawn as rings: the chosen one is a thick dark blue ring
	round a white centre.
-->
<div class="flex min-w-0 flex-[1.2_1_15rem] flex-col bg-surface px-4 pt-4 pb-5">
	<div class="flex flex-col gap-1.5">
		{#each LAUNCH_DONE_STEPS as step (step)}
			<div class="flex items-center gap-2.5 text-small text-ink-600">
				<span
					class="flex size-5 flex-none items-center justify-center rounded-full bg-brand-100 text-brand-900"
				>
					<Checkmark size={12} />
				</span>
				<span>{step}</span>
			</div>
		{/each}
		<div class="flex items-center gap-2.5 text-small font-semibold">
			<span
				class="flex size-5 flex-none items-center justify-center rounded-full border-2 border-brand-500 text-[0.6875rem] leading-none text-brand-900 tabular-nums"
			>
				5
			</span>
			<span>Launch</span>
		</div>
	</div>

	<div class="mt-3.5 flex flex-col gap-1.5">
		<div
			class="flex items-center gap-2 rounded-lg border border-line px-2.5 py-[0.4375rem] text-small"
		>
			<span class="size-3.5 flex-none rounded-full border-[1.5px] border-ink-400"></span>
			<span>Publish conference only</span>
		</div>
		<div
			class="flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-100 px-2.5 py-[0.4375rem] text-small font-medium text-brand-900"
		>
			<span class="size-3.5 flex-none rounded-full border-[0.28rem] border-brand-900 bg-surface"
			></span>
			<span>Publish and open applications</span>
		</div>
	</div>

	<span
		class="mt-3.5 self-start rounded-lg bg-brand-900 px-[1.125rem] py-2 text-small font-medium text-surface"
	>
		Publish
	</span>
</div>
