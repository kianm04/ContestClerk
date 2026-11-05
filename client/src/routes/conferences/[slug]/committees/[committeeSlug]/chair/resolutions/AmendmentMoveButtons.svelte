<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		amendmentId: string;
		/** "Amendment 3", which each button's name for a screen reader includes. */
		name: string;
		/** The first in the queue cannot move up, the last cannot move down. */
		isFirst: boolean;
		isLast: boolean;
	};

	let { amendmentId, name, isFirst, isLast }: Props = $props();

	// Sends a form without reloading the page once JavaScript runs; shared, so
	// neither button is pressed while the other is on its way.
	const inPlace = createInPlaceForm();

	const moves = $derived([
		{ direction: 'up', label: 'Move up', isShown: !isFirst },
		{ direction: 'down', label: 'Move down', isShown: !isLast }
	]);
</script>

<!--
	"Move up" and "Move down", each a plain form naming the amendment and the
	way it moves, so the dais reorders the queue without JavaScript.
-->
<div class="flex gap-2">
	{#each moves as move (move.direction)}
		{#if move.isShown}
			<form method="post" action="?/moveAmendment" use:enhance={inPlace.submit}>
				<input type="hidden" name="amendment" value={amendmentId} />
				<input type="hidden" name="direction" value={move.direction} />
				<Button
					type="submit"
					variant="outline"
					size="sm"
					class="max-md:h-11"
					aria-label="{move.label}: {name}"
					disabled={inPlace.isBusy}>{move.label}</Button
				>
			</form>
		{/if}
	{/each}
</div>
