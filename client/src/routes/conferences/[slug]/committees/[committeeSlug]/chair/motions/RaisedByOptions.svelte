<script lang="ts">
	import { noMatchText, type SeatOption } from '$lib/seat-search';
	import SeatFlag from '$lib/components/room/floor/SeatFlag.svelte';

	type Props = {
		/** The listbox's `id`, which the input names in `aria-controls`. */
		id: string;
		options: SeatOption[];
		/** The option Enter would choose, or -1 for none. */
		highlightedIndex: number;
		isOpen: boolean;
		/** What the chair typed, for "No seat matches …". */
		query: string;
		/** Called when the chair clicks an option, with its place in `options`. */
		onPick: (index: number) => void;
	};

	let { id, options, highlightedIndex, isOpen, query, onPick }: Props = $props();

	const hasNoMatch = $derived(options.length === 0 && query.trim() !== '');

	/**
	 * A press on an option must not take the focus from the input, or the list
	 * would close before the click lands.
	 */
	function handleMousedown(event: MouseEvent) {
		event.preventDefault();
	}
</script>

<!--
	"Raised by"'s list. The composer sits at the foot of the view, so the list
	opens upwards, above the box (`bottom-[calc(100%+4px)]`); the queue's
	`SeatOptionList` opens downwards. It is always on the page, so the input's
	`aria-controls` always points at something, and `hidden` while closed. An
	absent seat reads "absent" and is grey (`aria-disabled`): it cannot raise
	a motion.
-->
<div
	hidden={!isOpen || (options.length === 0 && !hasNoMatch)}
	class="absolute inset-x-0 bottom-[calc(100%+4px)] z-20 min-w-60 rounded-xl border border-line bg-surface p-1.5 shadow-card"
>
	<ul {id} role="listbox" aria-label="Seats" class="max-h-72 overflow-auto">
		<!-- The `(option.value)` key lets Svelte reuse each option as the list narrows. -->
		{#each options as option, index (option.value)}
			<!-- The keys are the input's, as the ARIA combobox pattern has it, so an option only needs the click. -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<li
				id="{id}-{index}"
				role="option"
				aria-selected={index === highlightedIndex}
				aria-disabled={!option.isChoosable}
				onmousedown={handleMousedown}
				onclick={() => onPick(index)}
				class="flex h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 aria-disabled:cursor-default aria-disabled:text-ink-400 aria-selected:bg-brand-50 max-md:h-11"
			>
				{#if option.seat}
					<SeatFlag seat={option.seat} size="row" />
				{/if}
				<span class="truncate">{option.label}</span>
				{#if option.mark}
					<span class="ml-auto text-small whitespace-nowrap text-ink-600">{option.mark}</span>
				{/if}
			</li>
		{/each}
	</ul>
	{#if hasNoMatch}
		<p role="status" class="p-2.5 text-small text-ink-600">{noMatchText(query)}</p>
	{/if}
</div>
