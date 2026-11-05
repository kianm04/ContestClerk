<script lang="ts">
	import ListOrdered from '@lucide/svelte/icons/list-ordered';
	import Notice from '$lib/components/Notice.svelte';
	import Section from '$lib/components/Section.svelte';
	import type { PaperDeadline, PositionPaperFile } from '$lib/documents';
	import PaperStatusCard from './PaperStatusCard.svelte';
	import PaperUploadForm from './PaperUploadForm.svelte';

	type Props = {
		/** The seat's paper as handed in, written or uploaded, or `null` for none yet. */
		document: PositionPaperFile | null;
		deadline: PaperDeadline;
		/** Why the paper cannot be changed now, from `canUploadPositionPaper`, or `null`. */
		closedReason: string | null;
		/** The problem the last upload had, if any, shown under the file box. */
		error: string | null;
		/** The committee's topics. Writing shows them beside the editor, so uploading lists them here. */
		topics: string[];
	};

	let { document, deadline, closedReason, error, topics }: Props = $props();

	const isWritten = $derived(document?.bodyMarkdown != null);
</script>

<div class="flex flex-col gap-4">
	{#if isWritten && !closedReason}
		<Notice tone="info">Uploading a PDF replaces the paper you wrote on MUNMeet.</Notice>
	{/if}

	<div class="grid gap-6 md:grid-cols-2 md:items-start">
		<PaperStatusCard {document} {deadline} />

		{#if closedReason}
			<Notice tone="warning">{closedReason}</Notice>
		{:else}
			<PaperUploadForm isReplacing={document !== null} {error} />
		{/if}
	</div>

	{#if topics.length > 0}
		<div class="mt-2">
			<Section title="Topics to cover" icon={ListOrdered}>
				<ol class="list-inside list-decimal text-body">
					<!-- Topics have no id of their own, so the place in the list is the key. -->
					{#each topics as topic, index (index)}
						<li>{topic}</li>
					{/each}
				</ol>
			</Section>
		</div>
	{/if}
</div>
