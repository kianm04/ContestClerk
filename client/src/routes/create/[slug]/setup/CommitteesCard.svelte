<script lang="ts">
	import FileText from '@lucide/svelte/icons/file-text';
	import Plus from '@lucide/svelte/icons/plus';
	import Users from '@lucide/svelte/icons/users-round';
	import { enhance } from '$app/forms';
	import CreationPanel from '$lib/components/creation/CreationPanel.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { SetupCommittee } from '$lib/creation-setup-dialog';
	import type { PreviousConference } from '$lib/creation-draft';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import type { ResolvedPathname } from '$app/types';
	import { createSetupDialogUrl, manageCommitteesUrl } from '$lib/urls';
	import CommitteeHints from './CommitteeHints.svelte';
	import CommitteeTable from './CommitteeTable.svelte';
	import PanelLink from './PanelLink.svelte';

	type Props = {
		slug: string;
		committees: SetupCommittee[];
		previous: PreviousConference | null;
		/** Whether the address asks for every committee, `?committees=all`. */
		showAll: boolean;
		allCommitteesUrl: ResolvedPathname;
		/** Whether the reader's role manages every committee. Without it, adding, editing and deleting would only be refused here, so somebody who manages only their own committees edits them on the committees page. */
		canManageCommittees: boolean;
		/** Whether the committees page opens for the reader, which it also does for somebody who manages only their own committees. */
		canOpenCommitteesPage: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let {
		slug,
		committees,
		previous,
		showAll,
		allCommitteesUrl,
		canManageCommittees,
		canOpenCommitteesPage
	}: Props = $props();

	// Sends the import without reloading the page, and shows the button busy meanwhile.
	const importForm = createInPlaceForm();

	// `$derived` works these out again whenever the props change. The import is
	// offered while this edition has none and the last one had some; the line
	// under the title says what the last edition had for as long as there was one.
	const hasPrevious = $derived(previous !== null && previous.committeeCount > 0);
	const canImport = $derived(committees.length === 0 && hasPrevious);
	const description = $derived(
		hasPrevious && previous
			? `${previous.committeeCount} committees found in ${previous.name}.`
			: 'Add the committees delegates can apply to.'
	);
</script>

<div id="committees" class="scroll-mt-24">
	<!--
		The panel's line stays on one line, as drawn, and is cut short with an
		ellipsis rather than run under the buttons when the organisation's name
		is long. On a phone the panel itself puts the buttons on their own line
		under the title.
	-->
	<CreationPanel
		title="Committees"
		icon={Users}
		{description}
		size="small"
		headerClass="lg:[&_p]:truncate"
	>
		<!-- `{#snippet actions()}` fills the panel's space on the right of its title. -->
		{#snippet actions()}
			<div class="flex items-center gap-2 max-lg:flex-wrap">
				<CommitteeHints />
				{#if canManageCommittees}
					<Button
						variant="outline"
						href={createSetupDialogUrl(slug, 'committee')}
						class="ml-2 h-8.5 gap-2 rounded-md border-creation-track bg-white px-3.5 fs-13 font-medium text-creation-blue hover:bg-creation-hover hover:text-creation-blue max-lg:ml-0 max-lg:min-h-11"
					>
						<Plus class="size-4" aria-hidden="true" />
						Add committee
					</Button>
					{#if canImport}
						<form method="POST" action="?/importCommittees" use:enhance={importForm.submit}>
							<!-- Filled, as drawn: bringing last year's set over is the quick way on. -->
							<Button
								type="submit"
								class="ml-0.5 h-8.5 gap-2 rounded-md px-3.5 fs-13 font-semibold hover:bg-creation-blue-hover max-lg:min-h-11"
								disabled={importForm.isBusy}
							>
								<FileText class="size-4" aria-hidden="true" />
								Use last year's committees
							</Button>
						</form>
					{/if}
				{/if}
				{#if canOpenCommitteesPage}
					<PanelLink href={manageCommitteesUrl(slug)} label="All committees" class="w-4.5" />
				{/if}
			</div>
		{/snippet}

		{#if committees.length === 0}
			<p class="mt-1 fs-14 text-creation-ink-450">No committees yet.</p>
		{:else}
			<CommitteeTable {slug} {committees} {showAll} {allCommitteesUrl} {canManageCommittees} />
		{/if}
	</CreationPanel>
</div>
