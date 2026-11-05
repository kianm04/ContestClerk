<script lang="ts">
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import type { SetupCommittee } from '$lib/creation-setup-dialog';
	import { createSetupDialogUrl } from '$lib/urls';
	import RowActions from './RowActions.svelte';

	type Props = {
		slug: string;
		committee: SetupCommittee;
		/** Its place in the list, counted from 1. */
		number: number;
		/** Whether the reader's role manages every committee. Without it, editing and deleting would only be refused here, so somebody who manages only their own committees edits them on the committees page. */
		canManageCommittees: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { slug, committee, number, canManageCommittees }: Props = $props();

	// `$derived` works this out again whenever `committee` changes.
	const shortName = $derived(committee.abbreviation ?? committee.name);
</script>

<!--
	One 36 design pixel row, a hairline under every row but the last. The grip
	is drawn as the design has it; the order is changed on the full committees
	page, so here it is only a picture. A room not yet given is underlined with
	dots, as drawn.
-->
<tr class="h-9 border-b border-creation-rule fs-14 last:border-b-0 max-lg:h-11">
	<td class="text-creation-ink-600">
		<GripVertical class="mx-auto block size-4.5" aria-hidden="true" />
	</td>
	<td class="pl-6.75 text-creation-ink-950 tabular-nums">{number}</td>
	<td class="truncate pl-6.75 font-semibold text-creation-ink-950">{shortName}</td>
	<td class="text-creation-ink-450 tabular-nums">{committee.plannedSeatCount ?? 'Not decided'}</td>
	<td class="truncate text-creation-ink-275">
		{#if committee.room}
			{committee.room}
		{:else}
			<span class="underline decoration-dotted underline-offset-[--spacing(0.75)]">Unassigned</span>
		{/if}
	</td>
	<!-- The cell stays without its buttons, so the columns keep their widths. -->
	<td class="pr-5.25">
		{#if canManageCommittees}
			<RowActions
				name={shortName}
				editHref={createSetupDialogUrl(slug, 'committee', committee.id)}
				deleteHref={createSetupDialogUrl(slug, 'delete-committee', committee.id)}
			/>
		{/if}
	</td>
</tr>
