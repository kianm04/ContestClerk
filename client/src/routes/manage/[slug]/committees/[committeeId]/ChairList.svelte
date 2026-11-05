<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import X from '@lucide/svelte/icons/x';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import type { CommitteeChair } from '$lib/committees';

	type Props = {
		/** The chairs to draw, without any a "Remove" press is taking away. */
		chairs: CommitteeChair[];
		/** The chairs the reader may take off, whose rows show "Remove"; the database refuses the rest. */
		removableChairIds: string[];
		/** Sends "Remove" through `ChairsPanel`'s instant form, which drops the row at once. */
		onRemove: SubmitFunction;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { chairs, removableChairIds, onRemove }: Props = $props();
</script>

<ul>
	<!-- The `(chair.userId)` key lets Svelte reuse rows instead of rebuilding
		them. Each row is a form of its own, so its button sends that chair's id. -->
	{#each chairs as chair (chair.userId)}
		<li class="border-b border-border">
			<form method="post" class="flex min-h-13 items-center gap-3 px-1 py-2" use:enhance={onRemove}>
				<input type="hidden" name="userId" value={chair.userId} />

				<Avatar name={chair.fullName} imagePath={chair.avatarPath} size="sm" />

				<!-- `min-w-0` lets a long name wrap instead of pushing the button out of the row. -->
				<div class="min-w-0 flex-1">
					<p class="text-dense font-medium text-foreground">{chair.fullName}</p>
					<p class="text-small text-muted-foreground">{chair.title}</p>
				</div>

				<!-- `isLabelHidden` draws the cross alone and keeps the words as its name. -->
				{#if removableChairIds.includes(chair.userId)}
					<Button
						label="Remove {chair.fullName} as a chair"
						variant="ghost"
						size="dense-sm"
						icon={X}
						isLabelHidden
						formaction="?/removeChair"
					/>
				{/if}
			</form>
		</li>
	{/each}
</ul>
