<script lang="ts">
	import { enhance } from '$app/forms';
	import FieldError from '$lib/components/FieldError.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { CRISIS_UPDATE_MAX_LENGTH, type CrisisUpdate } from '$lib/crisis-papers';
	import { formatTimeOfDay } from '$lib/dates';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		/** The update the room shows now, or `null` when there is none. */
		update: CrisisUpdate | null;
		/** What was typed and refused, sent back by the action, with why. */
		typed: { message: string; error: string | null } | null;
		/** The conference's time zone, which the time it was sent is told in. */
		timeZone: string;
	};

	let { update, typed, timeZone }: Props = $props();

	const FIELD_ID = 'crisis-update';
	const ERROR_ID = 'crisis-update-error';

	// Sent in the background; without JavaScript the same form posts and the page comes back.
	const inPlace = createInPlaceForm();
</script>

<!--
	The crisis update the room's live view and projector show until the next
	one. The box starts with the one on screen now, so a small change is a
	small edit; emptying it takes the update down.
-->
<section aria-label="Crisis update">
	<h2 class="border-b border-foreground pb-2 font-display text-h2 text-foreground">
		Crisis update
	</h2>

	<form
		method="post"
		action="?/sendUpdate"
		use:enhance={inPlace.submit}
		class="flex max-w-[42rem] flex-col gap-2 pt-4"
	>
		<Label for={FIELD_ID}>Update for the room</Label>
		<Textarea
			id={FIELD_ID}
			name="message"
			rows={3}
			maxlength={CRISIS_UPDATE_MAX_LENGTH}
			value={typed?.message ?? update?.message ?? ''}
			aria-describedby={typed?.error ? ERROR_ID : undefined}
			aria-invalid={typed?.error ? true : undefined}
		/>
		<FieldError id={ERROR_ID} message={typed?.error} />
		<p class="text-small text-muted-foreground tabular-nums">
			{update === null
				? 'The room shows no update.'
				: `On the room's screens since ${formatTimeOfDay(update.sentAt, timeZone)}. Empty the box to take it down.`}
		</p>
		<div class="pt-2">
			<Button type="submit" size="lg" class="max-lg:h-11" disabled={inPlace.isBusy}>
				Send update
			</Button>
		</div>
	</form>
</section>
