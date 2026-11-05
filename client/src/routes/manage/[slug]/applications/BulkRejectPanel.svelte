<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import TextArea from '$lib/components/TextArea.svelte';
	import { DECISION_NOTE_MAX_LENGTH, type OrganiserApplicationRow } from '$lib/applications';

	type Props = {
		/** The applications being turned down, in the table's order. */
		applicants: OrganiserApplicationRow[];
		/** What was typed into the note, so a refusal keeps it. */
		decisionNote: string;
		/**
		 * Where the button posts to, built by `manageApplicationsActionUrl` so
		 * that the tab and the filters survive the post. See that helper.
		 */
		rejectAction: string;
	};

	let { applicants, decisionNote, rejectAction }: Props = $props();

	// The same words on the heading and on the button, so the organiser presses
	// what they were promised. `$derived` counts them again after every action.
	const title = $derived(
		applicants.length === 1 ? 'Mark 1 as not accepted' : `Mark ${applicants.length} as not accepted`
	);

	const names = $derived(applicants.map((applicant) => applicant.applicantName).join(', '));
</script>

<!--
	Drawn inline above the table rather than inside `Modal`, which is a `<dialog>`
	opened by `showModal()` from an `$effect`: without JavaScript that dialog
	would never open, and `05-pages/organiser/applications.md` asks for exactly
	this content inline in that case. Drawing it inline always is one behaviour
	instead of two.
-->
<Card>
	<h2 class="text-h3 text-foreground">{title}</h2>

	<p class="mt-1 text-body text-muted-foreground">{names}</p>

	<!--
		Each application carries its own id, so this button acts on exactly the
		people named above whatever is ticked in the table below. The action puts
		every id through a `Set`, so saying it twice is harmless.
		The `(applicant.id)` key lets Svelte reuse the fields instead of rebuilding.
	-->
	{#each applicants as applicant (applicant.id)}
		<input type="hidden" name="ids" value={applicant.id} />
	{/each}

	<div class="mt-4">
		<TextArea
			label="Note for the applicants"
			name="decisionNote"
			value={decisionNote}
			maxLength={DECISION_NOTE_MAX_LENGTH}
			isDense
			help="Everybody listed above is sent this same note. Leave it empty to send none."
		/>
	</div>

	<!--
		No `isLoading`: pressing this changes the screen at once
		(`$lib/instant-form.svelte.ts`), so there is no wait for a spinner to show.
	-->
	<div class="mt-4">
		<Button label={title} variant="danger" size="dense" formaction={rejectAction} />
	</div>
</Card>
