<script lang="ts">
	import Button from '$lib/components/Button.svelte';

	type Props = {
		/** Whether the primary may be pressed: the committee has at least two members. */
		canStart: boolean;
		/** The line beside it: what pressing it does, or why it cannot be pressed yet. */
		note: string;
		/** "Start session" or "Save delegations". */
		primaryLabel: string;
		/** The form action it posts to: `?/start` or `?/save`. */
		primaryAction: string;
		/** True while its press is on its way, which shows the delayed spinner. */
		isLoading: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { canStart, note, primaryLabel, primaryAction, isLoading }: Props = $props();
</script>

<!--
	The page's one filled button, with its line beside it. On a phone the
	footer sticks to the bottom of the screen, so the button is always in
	reach while the lists scroll past; from `md` up the page fills the window
	and the footer is its last row.
-->
<div
	class="sticky bottom-0 flex shrink-0 items-center justify-end gap-4 border-t border-line bg-surface px-8 py-4 max-md:flex-col max-md:items-stretch max-md:gap-2 max-md:px-4 max-md:py-3"
>
	<p class="text-small text-ink-600">{note}</p>
	<!-- At least 200px wide, as the study draws it, and the full width on a phone. -->
	<div class="min-w-50 max-md:w-full">
		<Button
			label={primaryLabel}
			variant="primary"
			size="lg"
			formaction={primaryAction}
			isDisabled={!canStart}
			{isLoading}
			isFullWidth
		/>
	</div>
</div>
