<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Notice from '$lib/components/Notice.svelte';

	type Props = {
		/** What went wrong, in the words of `readSaveOutcome` in `$lib/session-notes.ts`. */
		message: string;
		/** Called when the chair presses "Try again". */
		onRetry: () => void;
	};

	let { message, onRetry }: Props = $props();
</script>

<div class="flex flex-col gap-2">
	<Notice tone="error" title="Your notes were not saved">
		<p>{message} Your notes are still here, so nothing you typed is lost.</p>
	</Notice>
	<div>
		<Button label="Try again" variant="secondary" onclick={onRetry} />
	</div>
</div>
