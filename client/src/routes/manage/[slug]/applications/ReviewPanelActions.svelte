<script lang="ts">
	import type { ReviewPanel, ReviewPanelRefusal } from '$lib/application-panel';
	import ReviewPanelDecision from './ReviewPanelDecision.svelte';
	import ReviewPanelNote from './ReviewPanelNote.svelte';

	type Props = {
		/** The one application the panel shows, as `load` read it. */
		panel: ReviewPanel;
		/** The last refused decision about this application, or null. */
		decisionRefusal: ReviewPanelRefusal | null;
		/** The last refused save of its note, or null. */
		noteRefusal: ReviewPanelRefusal | null;
	};

	let { panel, decisionRefusal, noteRefusal }: Props = $props();
</script>

<!-- The panel's two forms, drawn only for a reader who holds `decide_applications`. -->
<div class="mt-6">
	{#if panel.canAccept}
		<ReviewPanelDecision
			seatOptions={panel.seatOptions}
			seatId={decisionRefusal?.seatId ?? ''}
			error={decisionRefusal?.message ?? null}
			canWaitlist={panel.canWaitlist}
			canReject={panel.canReject}
			acceptAction={panel.links.acceptAction}
			waitlistAction={panel.links.waitlistAction}
			rejectAction={panel.links.rejectAction}
		/>
	{:else}
		<p class="text-dense text-muted-foreground">
			There is no decision left to make here. Open the full application to see more.
		</p>
	{/if}
</div>

<div class="mt-6">
	<ReviewPanelNote
		internalNote={noteRefusal?.internalNote ?? panel.internalNote}
		error={noteRefusal?.message ?? null}
		saveNoteAction={panel.links.saveNoteAction}
	/>
</div>
