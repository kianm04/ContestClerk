<script lang="ts">
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import {
		findSetupStep,
		nextSetupStepAfter,
		previousSetupStep,
		setupStepFooterText,
		type SetupStep,
		type SetupStepKey
	} from '$lib/setup-steps';
	import Button from '../Button.svelte';

	type Props = {
		/** The draft's six steps, from `setupSteps` in `$lib/setup-steps.ts`. */
		steps: SetupStep[];
		/** The step this page is. */
		current: SetupStepKey;
		/**
		 * The `id` of the page's form, which "Save and continue" sends; its action
		 * then moves on to the next step. Left out on a page that saves as it
		 * goes, such as Committees, where the button is a plain link onwards.
		 */
		formId?: string;
		/** While that form is being sent, from `createInPlaceForm()`. */
		isLoading?: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { steps, current, formId, isLoading = false }: Props = $props();

	// `$derived` works these out again whenever `steps` or `current` changes.
	const step = $derived(findSetupStep(steps, current));
	const previous = $derived(previousSetupStep(steps, step));
	const next = $derived(nextSetupStepAfter(steps, step));
</script>

<!--
	The bar along the bottom of a setup step while the conference is a draft
	(the manage redesign): where the organiser is, and the way back and on.
	`sticky bottom-0` keeps it at the bottom of the window while the form above
	scrolls, and lets it settle under the form once the end is reached.
-->
<div
	class="sticky bottom-0 mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background py-3.5"
>
	<p class="text-small text-muted-foreground">{setupStepFooterText(steps, step)}</p>

	<div class="flex flex-wrap gap-2">
		{#if previous}
			<Button label="Back" variant="secondary" size="dense" href={previous.href} />
		{/if}

		<!-- Fees and Team can be left for later, so they can be stepped over. -->
		{#if step.isOptional && next}
			<Button label="Skip for now" variant="secondary" size="dense" href={next.href} />
		{/if}

		{#if formId}
			<Button
				label="Save and continue"
				variant="primary"
				size="dense"
				form={formId}
				icon={ArrowRight}
				isIconAfterLabel
				{isLoading}
			/>
		{:else if next}
			<Button
				label="Continue"
				variant="primary"
				size="dense"
				href={next.href}
				icon={ArrowRight}
				isIconAfterLabel
			/>
		{/if}
	</div>
</div>
