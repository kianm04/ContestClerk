<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { amendmentName } from '$lib/paper-amendments';
	import { queuedAmendmentMetaLine, type QueuedAmendment } from '$lib/amendment-queue';
	import AmendmentMoveButtons from './AmendmentMoveButtons.svelte';

	type Props = {
		amendment: QueuedAmendment;
		position: number;
		href: ResolvedPathname;
		isFirst: boolean;
		isLast: boolean;
	};

	let { amendment, position, href, isFirst, isLast }: Props = $props();
</script>

<!--
	One amendment in the queue as a stacked row on a phone: its place and
	name, one meta line, and the buttons that move it.
-->
<div class="flex flex-col gap-2 border-b border-border py-3">
	<a {href} class="flex min-h-11 flex-col justify-center">
		<span class="text-body font-medium text-link">
			<span class="tabular-nums">{position}.</span>
			{amendmentName(amendment)}
		</span>
		<span class="text-small text-muted-foreground">{queuedAmendmentMetaLine(amendment)}</span>
	</a>
	<AmendmentMoveButtons
		amendmentId={amendment.id}
		name={amendmentName(amendment)}
		{isFirst}
		{isLast}
	/>
</div>
