<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import TextArea from '$lib/components/TextArea.svelte';
	import { DECISION_NOTE_MAX_LENGTH } from '$lib/applications';

	type Props = {
		/** True while the application is still `submitted`; a waitlisted one cannot be again. */
		canWaitlist: boolean;
		/** What was in the note box when the last post was refused, or `''`. */
		decisionNote: string;
		/** Where "Waitlist" posts. */
		waitlistAction: string;
		/** Where "Not accepted" posts. */
		rejectAction: string;
		/** The page's instant form, so the status changes the moment it is pressed (T142). */
		onSubmit: SubmitFunction;
	};

	let { canWaitlist, decisionNote, waitlistAction, rejectAction, onSubmit }: Props = $props();
</script>

<!--
	`ConfirmButton` renders a form of its own, and a form cannot sit inside
	another form, so "Waitlist" and "Not accepted" each carry their own note box.
	Both boxes sit on the page rather than in the dialog, so they can be filled in
	without JavaScript. They share the name the actions read, so each gets its own
	`idKey`, or both labels would point at the first box.
-->
<div class="flex flex-col gap-4">
	{#if canWaitlist}
		<form method="post" action={waitlistAction} class="flex flex-col gap-3" use:enhance={onSubmit}>
			<TextArea
				isDense
				label="Note to the applicant (optional)"
				name="decisionNote"
				idKey="waitlist-note"
				value={decisionNote}
				rows={3}
				maxLength={DECISION_NOTE_MAX_LENGTH}
			/>

			<div>
				<Button label="Waitlist" variant="secondary" size="dense" />
			</div>
		</form>
	{/if}

	<ConfirmButton
		label="Not accepted"
		confirmTitle="Mark this application as not accepted?"
		confirmText="The applicant is told, and can no longer be given a seat."
		formaction={rejectAction}
		size="dense"
		{onSubmit}
	>
		<TextArea
			isDense
			label="Why not? The applicant reads this."
			name="decisionNote"
			idKey="reject-note"
			value={decisionNote}
			rows={3}
			maxLength={DECISION_NOTE_MAX_LENGTH}
		/>
	</ConfirmButton>
</div>
