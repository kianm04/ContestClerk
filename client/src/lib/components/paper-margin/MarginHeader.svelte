<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { SuggestionDecision } from '$lib/paper-suggestions';

	type Props = {
		/** "Suggestions" while any are open, "Comments" otherwise. */
		title: string;
		/** Whether the other authors have suggestions open, which the buttons decide together. */
		isDecidingAll: boolean;
		onDecideAll: (decision: SuggestionDecision) => void;
	};

	let { title, isDecidingAll, onDecideAll }: Props = $props();

	const BUTTON_CLASSES = 'h-8 border-input px-3 text-small font-medium max-lg:h-11';
</script>

<!--
	The margin's title, with its black rule. On a desktop the comments sit
	beside their words and need no title, so it is only read out there; the
	suggestions keep it for "Accept all" and "Reject all".
-->
<div
	class={[
		'mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-foreground pb-2',
		!isDecidingAll && 'lg:sr-only'
	]}
>
	<h2 class="font-display text-h2 text-foreground">{title}</h2>
	{#if isDecidingAll}
		<div class="flex gap-2">
			<Button variant="outline" class={BUTTON_CLASSES} onclick={() => onDecideAll('accept')}>
				Accept all
			</Button>
			<Button variant="outline" class={BUTTON_CLASSES} onclick={() => onDecideAll('reject')}>
				Reject all
			</Button>
		</div>
	{/if}
</div>
