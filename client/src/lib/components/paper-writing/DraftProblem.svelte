<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Notice from '$lib/components/Notice.svelte';

	type Props = {
		/** The notice's heading, such as "Your changes were not saved" for a committee's paper. */
		title?: string;
		/** What went wrong with the last save. */
		message: string;
		/** The words on the button that puts it right, such as "Try again". */
		actionLabel: string;
		/** Called when the delegate presses that button. */
		onAction: () => void;
	};

	let { title = 'Your draft was not saved', message, actionLabel, onAction }: Props = $props();
</script>

<div class="flex flex-col gap-2">
	<Notice tone="error" {title}>
		<p>{message} Your text is still here, so nothing you typed is lost.</p>
	</Notice>
	<div>
		<!-- `type="button"`, because this sits inside the submit form and must not send it. -->
		<Button label={actionLabel} type="button" variant="secondary" size="sm" onclick={onAction} />
	</div>
</div>
