<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { PAPER_COMMENT_MAX_LENGTH } from '$lib/paper-comments';
	import type { NewCommentWriter } from '$lib/paper-margin';
	import type { PostedPassage } from '$lib/paper-threads';
	import { cn } from '$lib/utils';

	type Props = {
		/**
		 * The words the comment is on, read the moment it is sent, or `null`
		 * for the whole paper. Left out without JavaScript, where every new
		 * comment is on the whole paper.
		 */
		passage?: () => PostedPassage | null;
		/** Closes the card: after the comment is posted, and on Cancel. */
		onDone?: () => void;
		isActive?: boolean;
		/** Who is writing, shown above the field when the card is signed, as the dais's notes are. */
		writer?: NewCommentWriter;
	};

	let { passage, onDone, isActive = false, writer }: Props = $props();

	const uid = $props.id();
	const fieldId = `${uid}-comment`;
	let field: HTMLTextAreaElement | null = $state(null);

	const inPlace = createInPlaceForm({
		onSend: (formData) => {
			const posted = passage?.();
			if (!posted) return;

			formData.set('anchorStart', posted.anchorStart);
			formData.set('anchorEnd', posted.anchorEnd);
			formData.set('quotedText', posted.quotedText);
			formData.set('part', posted.part);
		},
		onSettle: () => onDone?.()
	});

	// "Comment" opens this card to be written in at once.
	onMount(() => {
		if (onDone) field?.focus();
	});
</script>

<!-- A new thread: on the words chosen in the text, or on the whole paper. -->
<form
	id="new-thread"
	method="post"
	action="?/startThread"
	use:enhance={inPlace.submit}
	class={cn(
		'rounded-xl border bg-card px-4 pt-3.5 pb-4 transition-colors max-lg:rounded-none max-lg:border-x-0 max-lg:border-t-0 max-lg:px-0',
		isActive ? 'border-ring' : 'border-border'
	)}
>
	{#if writer}
		<p class="flex flex-wrap items-baseline gap-x-2">
			<span class="text-dense font-semibold text-foreground">{writer.name}</span>
			{#if writer.title}<span class="text-caption text-muted-foreground">{writer.title}</span>{/if}
		</p>
	{/if}
	<!-- A signed card names its writer instead, so its label is for screen readers only. -->
	<label for={fieldId} class={cn('text-label text-foreground', writer && 'sr-only')}>
		{onDone ? 'New comment' : 'Comment on the whole paper'}
	</label>
	<Textarea
		bind:ref={field}
		id={fieldId}
		name="body"
		rows={3}
		required
		maxlength={PAPER_COMMENT_MAX_LENGTH}
		readonly={inPlace.isBusy}
		class="mt-1.5 min-h-0 resize-none px-2.5 py-1.5 text-dense md:text-dense"
	/>
	<div class="mt-2 flex items-center gap-3">
		<Button
			type="submit"
			variant="outline"
			class="h-8 border-input px-3 text-small font-medium max-lg:h-11"
			disabled={inPlace.isBusy}
		>
			Comment
		</Button>
		{#if onDone}
			<Button
				type="button"
				variant="ghost"
				class="h-8 px-2 text-small font-medium max-lg:h-11"
				onclick={onDone}
			>
				Cancel
			</Button>
		{/if}
	</div>
</form>
