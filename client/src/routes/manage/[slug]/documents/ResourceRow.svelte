<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Download from '@lucide/svelte/icons/download';
	import FileText from '@lucide/svelte/icons/file-text';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Button from '$lib/components/Button.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import { DOCUMENT_AUDIENCE_OPTIONS, formatFileSize, type ResourceFile } from '$lib/documents';
	import { resourceAddedText } from '$lib/documents-page';

	type Props = {
		resource: ResourceFile;
		/** The conference's timezone, which the upload date is shown in. */
		timezone: string;
		/** `ResourceList`'s shared instant form, for "Save" and "Delete". */
		onSubmit: SubmitFunction;
	};

	let { resource, timezone, onSubmit }: Props = $props();
</script>

<!--
	One shared file as a row of the table in `ResourceList`. The cells keep to
	one line (`whitespace-nowrap`), so on a phone the table scrolls sideways in
	its own box instead of squeezing the words.
-->
<tr class="border-b border-border">
	<td class="min-w-48 p-3 text-dense">
		<span class="inline-flex items-center gap-2.5">
			<FileText size={16} class="shrink-0 text-muted-foreground" aria-hidden="true" />
			<span class="font-medium text-foreground">{resource.title}</span>
		</span>
	</td>

	<td class="p-3">
		<!--
			Who can see it is a small form of its own, so changing it works without
			JavaScript; "Save" sends it. The select has no visible label, because
			the column heading says what it is, so `aria-label` names it instead.
		-->
		<form
			method="post"
			action="?/updateResourceAudience"
			class="flex items-center gap-2"
			use:enhance={onSubmit}
		>
			<input type="hidden" name="documentId" value={resource.id} />
			<select
				name="audience"
				aria-label="Audience of {resource.title}"
				class="h-9 rounded-control border border-border bg-background px-2 text-dense text-foreground"
			>
				<!-- `selected` marks the saved audience in the HTML, so it shows without JavaScript too. -->
				{#each DOCUMENT_AUDIENCE_OPTIONS as option (option.value)}
					<option value={option.value} selected={option.value === resource.audience}>
						{option.label}
					</option>
				{/each}
			</select>
			<Button label="Save" variant="secondary" size="dense-sm" />
		</form>
	</td>

	<td class="p-3 text-dense whitespace-nowrap text-foreground tabular-nums">
		{formatFileSize(resource.fileSizeBytes)}
	</td>

	<td class="p-3 text-dense whitespace-nowrap text-foreground">
		{resourceAddedText(resource, timezone)}
	</td>

	<td class="p-3">
		<div class="flex items-center justify-end gap-1">
			<!--
				The address is a signed one made in `load` and good for a minute, so it
				points at Supabase Storage rather than at a page of ours, and there is no
				route for `resolve()` to check it against. `BackgroundGuidePanel.svelte`
				in the committee editor explains the switched-off rule around it.
			-->
			{#if resource.downloadUrl}
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={resource.downloadUrl}
					target="_blank"
					rel="noreferrer"
					title="Link valid for one minute"
					aria-label="Download {resource.title}"
					class="inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground lg:size-8"
				>
					<Download size={16} aria-hidden="true" />
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{:else}
				<span class="text-small whitespace-nowrap text-muted-foreground">Download unavailable</span>
			{/if}

			<!-- The id travels inside the dialog, so no empty line sits above the button.
				It is a grey bin that turns red under the pointer; "Delete" is its name. -->
			<ConfirmButton
				label="Delete"
				confirmTitle="Delete this file?"
				confirmText="It disappears for everyone it was shared with."
				formaction="?/deleteDocument"
				variant="quiet-danger"
				size="dense-sm"
				icon={Trash2}
				areFieldsInDialog
				{onSubmit}
			>
				<input type="hidden" name="documentId" value={resource.id} />
			</ConfirmButton>
		</div>
	</td>
</tr>
