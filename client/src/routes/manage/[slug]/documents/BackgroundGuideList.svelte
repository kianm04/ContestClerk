<script lang="ts">
	import Landmark from '@lucide/svelte/icons/landmark';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import {
		describeDocumentDeleteFailure,
		expectGuideDeleted,
		withCommitteeId,
		type GuideRow
	} from '$lib/document-delete-presses';
	import type { CommitteeGuide } from '$lib/documents';
	import { createInstantForm, type InstantSubmitInput } from '$lib/instant-form.svelte';
	import { rowsAfterPresses, type RowChange } from '$lib/row-changes';
	import { manageCommitteesUrl } from '$lib/urls';
	import GuideCard from './GuideCard.svelte';

	type Props = {
		/** Every committee of the conference, each with its guide or `null`. */
		guides: CommitteeGuide[];
		/** The committee whose upload was just refused, if one was. */
		errorCommitteeId: string | null;
		/** Why it was refused. */
		error: string | null;
		conferenceSlug: string;
	};

	let { guides, errorCommitteeId, error, conferenceSlug }: Props = $props();

	/*
		Deleting a background guide is worked out in the browser
		(`$lib/document-delete-presses.ts`), so the line shows "Missing" the
		moment "Delete guide" is pressed instead of waiting for the server
		(T142). One form serves every line; each line's `ConfirmButton` sends it.
	*/
	const deleteForm = createInstantForm<RowChange<GuideRow>[]>({
		describeFailure: describeDocumentDeleteFailure
	});

	// The committees this page loaded, given the `id` a `RowChange` needs to find one.
	const guideRows = $derived(guides.map(withCommitteeId));

	function expectPress(input: InstantSubmitInput): RowChange<GuideRow>[] | null {
		return expectGuideDeleted(input, guideRows);
	}

	const submitDelete = deleteForm.submitExpecting(expectPress);

	// The committees shown, with any presses still on their way laid on top.
	const previewedGuides = $derived(rowsAfterPresses(guideRows, deleteForm.presses));
</script>

{#if guides.length === 0}
	<EmptyState
		icon={Landmark}
		title="Add committees first."
		description="Each committee has one background guide, so the list starts once there are committees."
		actionLabel="Go to committees"
		actionHref={manageCommitteesUrl(conferenceSlug)}
	/>
{:else}
	<!-- One flat line per committee on the white page, each with a thin line under it. -->
	<ul aria-label="Background guides">
		<!-- The `(committee.committeeId)` key lets Svelte reuse lines instead of rebuilding them. -->
		{#each previewedGuides as committee (committee.committeeId)}
			<li class="border-b border-border">
				<GuideCard
					{committee}
					error={committee.committeeId === errorCommitteeId ? error : null}
					{conferenceSlug}
					onDelete={submitDelete}
				/>
			</li>
		{/each}
	</ul>
{/if}
