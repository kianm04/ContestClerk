<script lang="ts">
	import Badge from '$lib/components/Badge.svelte';
	import Flag from '$lib/components/Flag.svelte';
	import { paperDateLine } from '$lib/chair-papers';
	import { paperStatusLabel, type PaperDeadline } from '$lib/documents';
	import { paperStatusTone, type PaperSeatRow } from '$lib/documents-page';
	import { paperLengthText } from '$lib/paper-sheet';

	type Props = {
		/** The delegate's seat and the paper written for it. */
		seat: PaperSeatRow;
		/** The committee's full name, such as "Security Council". */
		committeeName: string;
		/** The deadline and timezone the date is shown against. */
		conference: PaperDeadline;
		wordCount: number;
	};

	let { seat, committeeName, conference, wordCount }: Props = $props();

	// `$derived` works this out again whenever the seat changes, as after a review.
	const dateLine = $derived(seat.paper === null ? null : paperDateLine(seat.paper, conference));
</script>

<header class="flex flex-col gap-2 border-b border-border pb-4">
	<div class="flex flex-wrap items-center gap-3">
		{#if seat.countryCode}
			<Flag countryCode={seat.countryCode} />
		{/if}
		<h1 class="font-display text-h2">{seat.seatName}</h1>
		<!-- The review status is for the chair, not part of the paper, so it is not printed. -->
		<span class="print:hidden">
			<Badge tone={paperStatusTone(seat.status)} label={paperStatusLabel(seat.status)} />
		</span>
	</div>
	<p class="text-body text-foreground">Position paper · {committeeName}</p>
	<p class="text-small text-muted-foreground">
		{seat.delegateName ?? 'Delegate'}
		{#if dateLine}· {dateLine}{/if}
		· {paperLengthText(wordCount)}
	</p>
</header>
