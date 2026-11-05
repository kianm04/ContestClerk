<script lang="ts">
	import { paperLengthText } from '$lib/paper-sheet';
	import { draftSaveStatusText, type DraftSaveStatus } from '$lib/paper-writing';

	type Props = {
		wordCount: number;
		status: DraftSaveStatus;
		/** When the draft was last stored, in milliseconds since 1970, or `null` when never. */
		savedAt: number | null;
		/** False without JavaScript, when nothing is saved by itself and only the count shows. */
		isAutosaving: boolean;
	};

	let { wordCount, status, savedAt, isAutosaving }: Props = $props();

	// The clock the "5s ago" is counted from. `$state` redraws the line when it moves on.
	let now = $state(Date.now());

	/*
		Moves `now` on once a second, so "Saved 5s ago" keeps counting.
		`$effect` runs in the browser once the component is on screen, and the
		function it returns stops the clock when the component goes away.
	*/
	$effect(() => {
		const clock = setInterval(() => (now = Date.now()), 1000);

		return () => clearInterval(clock);
	});

	const statusText = $derived(isAutosaving ? draftSaveStatusText(status, savedAt, now) : '');
	const isProblem = $derived(status === 'failed' || status === 'conflict');
</script>

<div class="flex flex-wrap justify-between gap-2 text-small text-muted-foreground">
	<!-- The pages are an estimate from the words (`WORDS_PER_PAGE`), the way a word processor counts. -->
	<p>{paperLengthText(wordCount)}</p>
	<!--
		The save line ticks every second, which a screen reader must not read out
		each time, so it is hidden from one. The `sr-only` line says the same
		only when the state changes (`aria-live` reads out whatever new it holds).
	-->
	<p class={isProblem ? 'text-destructive' : ''} aria-hidden="true">{statusText}</p>
	<p class="sr-only" aria-live="polite">
		{status === 'saved' && savedAt !== null ? 'Draft saved' : statusText}
	</p>
</div>
