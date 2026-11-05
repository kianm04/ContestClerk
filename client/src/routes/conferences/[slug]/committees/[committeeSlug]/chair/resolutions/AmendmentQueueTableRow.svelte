<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { amendmentName } from '$lib/paper-amendments';
	import { paperKindAndNumber } from '$lib/committee-papers';
	import type { QueuedAmendment } from '$lib/amendment-queue';
	import AmendmentMoveButtons from './AmendmentMoveButtons.svelte';

	type Props = {
		amendment: QueuedAmendment;
		/** Its place in the queue, from 1. */
		position: number;
		/** The amendment's card on its draft's review page. */
		href: ResolvedPathname;
		isFirst: boolean;
		isLast: boolean;
	};

	let { amendment, position, href, isFirst, isLast }: Props = $props();
</script>

<!-- One amendment in the queue's table; `AmendmentQueueListRow` is the same on a phone. -->
<tr class="border-b border-border text-dense text-foreground">
	<!-- `tabular-nums` keeps the places lined up from one row to the next. -->
	<td class="p-3 tabular-nums">{position}</td>
	<td class="p-3">
		<a {href} class="font-medium text-link">{amendmentName(amendment)}</a>
		<p class="text-small text-muted-foreground">{amendment.paper.title}</p>
	</td>
	<td class="p-3">{paperKindAndNumber({ kind: 'draft_resolution', ...amendment.paper })}</td>
	<td class="p-3">{amendment.proposerName ?? ''}</td>
	<td class="p-3">{amendment.isFriendly ? 'Friendly' : 'Unfriendly'}</td>
	<td class="p-3">
		<AmendmentMoveButtons
			amendmentId={amendment.id}
			name={amendmentName(amendment)}
			{isFirst}
			{isLast}
		/>
	</td>
</tr>
