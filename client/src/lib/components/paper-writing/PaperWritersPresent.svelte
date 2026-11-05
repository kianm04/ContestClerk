<script lang="ts">
	import type { LiveStatus } from '$lib/committee-room-live';
	import { editingText, writerTitle, type LiveWriter } from '$lib/live-writers';
	import { initials } from '$lib/text';

	type Props = {
		/** Everybody else in the paper now, from `writersPresent`. */
		writers: LiveWriter[];
		/** Whether the live channel to the others is connecting, live or paused. */
		status: LiveStatus;
	};

	let { writers, status }: Props = $props();

	/*
		`$derived` works these out again whenever `writers` or `status` changes.
		While the channel is paused nobody can be seen arriving or leaving, so
		nobody is shown rather than somebody who may have gone.
	*/
	const shownWriters = $derived(status === 'paused' ? [] : writers);
	const text = $derived(editingText(shownWriters));
</script>

<!--
	Who else is writing the paper now (T148): a circle of initials each, all
	alike, because the name on each cursor is what tells writers apart.
	Pointing at a circle names the writer and their seat. A screen reader
	hears "Rachel is editing" from the status line as people come and go.
-->
{#if shownWriters.length > 0}
	<ul aria-label="Writing now" class="flex items-center gap-1">
		<!-- The `(writer.id)` key lets Svelte reuse each circle instead of rebuilding it. -->
		{#each shownWriters as writer (writer.id)}
			<li
				title={writerTitle(writer)}
				class="flex size-8 items-center justify-center rounded-full bg-muted text-caption leading-none font-semibold text-foreground"
			>
				<span aria-hidden="true">{initials(writer.name)}</span>
				<span class="sr-only">{writerTitle(writer)}</span>
			</li>
		{/each}
	</ul>
{/if}
<p class="sr-only" role="status">{text ?? ''}</p>
