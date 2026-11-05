<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { buttonClasses } from '$lib/button-classes';
	import Badge from '$lib/components/Badge.svelte';
	import SeatName from '$lib/components/SeatName.svelte';
	import {
		delegationPaperPill,
		paperLastEditedText,
		type DelegationPaper
	} from '$lib/delegation-papers';
	import { wordCountText } from '$lib/paper-writing';

	type Props = {
		/** The paper this row is about. */
		paper: DelegationPaper;
		/** Where "Open" goes, from `delegationPaperHref`. */
		href: ResolvedPathname;
		/** The signed-in reader, so their own edit reads "by you". */
		readerId: string;
		/** When the page was drawn, in milliseconds since 1970, for "5 min ago". */
		now: number;
	};

	let { paper, href, readerId, now }: Props = $props();

	// `$derived` works these out again if the row is handed another paper.
	const pill = $derived(delegationPaperPill(paper));
	const lastEdited = $derived(paperLastEditedText(paper, readerId, now));
	// An uploaded PDF has no words MUNMeet can count, so it shows none.
	const words = $derived(paper.paperKind === 'uploaded' ? null : wordCountText(paper.wordCount));
</script>

<!-- One member's paper for one seat. On a phone the details wrap under the name. -->
<li class="flex flex-wrap items-center justify-between gap-3 py-3">
	<div class="flex min-w-0 flex-col gap-1">
		<p class="text-body font-medium text-ink-900">{paper.holderName}</p>
		<p class="text-small text-ink-600">
			{paper.committeeName} ·
			<SeatName name={paper.seatName} countryCode={paper.countryCode} />
		</p>
		<p class="flex flex-wrap items-center gap-2 text-small text-ink-600">
			<Badge tone={pill.tone} label={pill.label} />
			{#if words}
				<span>{words}</span>
			{/if}
			{#if lastEdited}
				<span>{lastEdited}</span>
			{/if}
		</p>
	</div>
	<!--
		A plain link dressed as a small button, rather than `Button`, because
		every row has an "Open" and a screen reader needs to hear whose paper
		each one opens, which `Button` has no way to add.
	-->
	<a
		{href}
		class={buttonClasses('secondary', 'sm', false)}
		aria-label={`Open ${paper.holderName}'s ${paper.committeeName} paper`}
	>
		Open
	</a>
</li>
