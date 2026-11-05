<script lang="ts">
	import { saveStatusText, type NotesSaveStatus } from '$lib/session-notes';

	type Props = {
		status: NotesSaveStatus;
		/** When the notes were last stored, in milliseconds since 1970, or null when they never were. */
		savedAt: number | null;
	};

	let { status, savedAt }: Props = $props();

	// The clock the "10s ago" is counted from. `$state` redraws the line when it moves on.
	let now = $state(Date.now());

	/*
		Moves `now` on once a second, so "Auto-saved 10s ago" keeps counting.
		`$effect` runs in the browser once the component is on screen, and the
		function it returns stops the clock when the component goes away.
	*/
	$effect(() => {
		const clock = setInterval(() => (now = Date.now()), 1000);

		return () => clearInterval(clock);
	});

	const statusText = $derived(saveStatusText(status, savedAt, now));
	const isProblem = $derived(status === 'failed' || status === 'conflict');
</script>

<!--
	The line ticks every second, which a screen reader must not read out each
	time, so it is hidden from one. The `sr-only` line below says the same
	only when the state changes (`aria-live` reads out whatever new it holds).
-->
<p class="text-small {isProblem ? 'text-danger-700' : 'text-ink-600'}" aria-hidden="true">
	{statusText}
</p>
<p class="sr-only" aria-live="polite">
	{status === 'saved' && savedAt !== null ? 'Notes saved' : statusText}
</p>
