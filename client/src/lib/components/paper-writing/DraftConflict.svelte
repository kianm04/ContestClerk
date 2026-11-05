<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import MarkdownContent from '$lib/components/markdown-editor/MarkdownContent.svelte';
	import { draftChangedByText, type TheirDraft } from '$lib/paper-writing';

	type Props = {
		/** The draft a fellow member, or the writer's own other window, saved first. */
		theirDraft: TheirDraft;
		/** The signed-in writer, so their own other window is called "You". */
		readerId: string;
		/** Save the text on screen over theirs. */
		onKeepMine: () => void;
		/** Replace the text on screen with theirs. */
		onUseTheirs: () => void;
	};

	let { theirDraft, readerId, onKeepMine, onUseTheirs }: Props = $props();
</script>

<!-- The same choice the chair's session notes offer on a clash (T130's `NotesConflict`). -->
<div class="flex flex-col gap-2">
	<Notice tone="warning" title={draftChangedByText(theirDraft, readerId)}>
		<p>Your text is still here and has not been saved. Choose which version to keep.</p>
	</Notice>

	<!-- `<details>` opens and closes by itself when its `<summary>` is pressed. -->
	<details class="rounded-control border border-line p-3">
		<summary class="cursor-pointer text-body font-medium">See their version</summary>
		<div class="mt-2">
			<MarkdownContent html={theirDraft.bodyHtml} />
		</div>
	</details>

	<!-- `type="button"`, because these sit inside the writing form and must not send it. -->
	<div class="flex flex-wrap gap-2">
		<Button label="Keep mine" type="button" variant="primary" onclick={onKeepMine} />
		<Button label="Use theirs" type="button" variant="secondary" onclick={onUseTheirs} />
	</div>
</div>
