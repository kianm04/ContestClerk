<script lang="ts">
	import { returnedNotes } from '$lib/paper-submitting';
	import type { PaperProgress } from './paper-resolution';

	type Props = {
		/** Where the paper stands with the dais; the notes show only once it returned the paper. */
		progress: PaperProgress;
		/** The conference's time zone, which the byline's time is told in. */
		timeZone: string;
	};

	let { progress, timeZone }: Props = $props();

	// "Eleanor Price, Chair · 15 March, 09:46" under the comment, or `null` for a paper not returned.
	const notes = $derived(returnedNotes(progress, progress.decision, timeZone));
</script>

<!--
	The dais's comment on a returned paper, above its editor, so the authors
	read what to change before they change it. `whitespace-pre-line` keeps the
	lines the dais broke its comment into.
-->
{#if notes}
	<section aria-labelledby="returned-notes" class="mb-8">
		<h2
			id="returned-notes"
			class="border-b border-foreground pb-2 font-display text-h2 font-semibold text-foreground"
		>
			Returned with notes
		</h2>
		<p class="mt-3 max-w-[68ch] text-body whitespace-pre-line text-foreground">{notes.comment}</p>
		<p class="mt-1 text-small text-muted-foreground">{notes.byline}</p>
	</section>
{/if}
