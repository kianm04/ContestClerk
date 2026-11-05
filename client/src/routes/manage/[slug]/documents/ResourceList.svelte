<script lang="ts">
	import FolderOpen from '@lucide/svelte/icons/folder-open';
	import DataTable, { type TableColumn } from '$lib/components/DataTable.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import {
		describeResourceFailure,
		expectResourceAudienceChange,
		expectResourceDeleted
	} from '$lib/document-delete-presses';
	import { DOCUMENT_MAX_SIZE_MB, type ResourceFile } from '$lib/documents';
	import { createInstantForm, type InstantSubmitInput } from '$lib/instant-form.svelte';
	import { rowsAfterPresses, type RowChange } from '$lib/row-changes';
	import ResourceRow from './ResourceRow.svelte';

	type Props = {
		resources: ResourceFile[];
		/** The conference's timezone, which upload dates are shown in. */
		timezone: string;
	};

	let { resources, timezone }: Props = $props();

	/*
		Deleting a resource and saving its audience are worked out in the browser
		(`$lib/document-delete-presses.ts`), so the row disappears, or its badge
		changes, the moment the button is pressed instead of waiting for the
		server (T142). One form serves every row; each row hands its presses to it.
	*/
	const resourceForm = createInstantForm<RowChange<ResourceFile>[]>({
		describeFailure: describeResourceFailure
	});

	function expectPress(input: InstantSubmitInput): RowChange<ResourceFile>[] | null {
		return (
			expectResourceDeleted(input, resources) ?? expectResourceAudienceChange(input, resources)
		);
	}

	const submitResourcePress = resourceForm.submitExpecting(expectPress);

	// The resources shown, with any presses still on their way laid on top.
	const previewedResources = $derived(rowsAfterPresses(resources, resourceForm.presses));

	/** The table's headings. The last column holds the download link and "Delete". */
	const COLUMNS: TableColumn[] = [
		{ key: 'file', label: 'File' },
		{ key: 'audience', label: 'Who can see it', width: 'w-60' },
		{ key: 'size', label: 'Size', width: 'w-25' },
		{ key: 'added', label: 'Added', width: 'w-55' },
		{ key: 'actions', label: '', width: 'w-35' }
	];
</script>

<section aria-label="Shared files">
	{#if previewedResources.length === 0}
		<EmptyState
			icon={FolderOpen}
			title="No resources yet."
			description="Rules of procedure, a venue map or a position paper template are good first uploads."
		/>
	{:else}
		<!-- `DataTable` draws the headings; each `ResourceRow` is one `<tr>` of it. -->
		<DataTable columns={COLUMNS} isDense>
			<!-- The `(resource.id)` key lets Svelte reuse rows instead of rebuilding them. -->
			{#each previewedResources as resource (resource.id)}
				<ResourceRow {resource} {timezone} onSubmit={submitResourcePress} />
			{/each}
		</DataTable>

		<p class="mx-1 mt-3 text-small text-muted-foreground">
			PDF, image or Word document, up to {DOCUMENT_MAX_SIZE_MB} MB. Background guides belong to a committee
			and are uploaded on its page or in the Background guides tab.
		</p>
	{/if}
</section>
