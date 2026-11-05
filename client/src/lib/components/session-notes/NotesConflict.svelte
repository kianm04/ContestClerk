<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import MarkdownContent from '$lib/components/markdown-editor/MarkdownContent.svelte';
	import { changedByText, type SessionNotes } from '$lib/session-notes';

	type Props = {
		/** The notes another chair saved while this chair was typing. */
		theirNotes: SessionNotes;
		/** The signed-in chair, so their own other window is called "You". */
		readerId: string;
		/** Save the text on screen over theirs. */
		onKeepMine: () => void;
		/** Replace the text on screen with theirs. */
		onUseTheirs: () => void;
	};

	let { theirNotes, readerId, onKeepMine, onUseTheirs }: Props = $props();
</script>

<div class="flex flex-col gap-2">
	<Notice tone="warning" title={changedByText(theirNotes, readerId)}>
		<p>Your text is still here and has not been saved. Choose which notes to keep.</p>
	</Notice>

	<!-- `<details>` opens and closes by itself when its `<summary>` is pressed. -->
	<details class="rounded-control border border-line p-3">
		<summary class="cursor-pointer text-body font-medium">See their version</summary>
		<div class="mt-2">
			<MarkdownContent html={theirNotes.bodyHtml} />
		</div>
	</details>

	<div class="flex flex-wrap gap-2">
		<Button label="Keep mine" variant="primary" onclick={onKeepMine} />
		<Button label="Use theirs" variant="secondary" onclick={onUseTheirs} />
	</div>
</div>
