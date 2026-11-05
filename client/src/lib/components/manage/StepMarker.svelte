<script lang="ts">
	import Check from '@lucide/svelte/icons/check';

	type Props = {
		/** 1 to 6, which step of setting up this is. */
		number: number;
		isDone: boolean;
		/** The step whose page is open. A step that is done keeps its tick even then. */
		isCurrent: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { number, isDone, isCurrent }: Props = $props();

	/* Written out in full, because Tailwind reads the class names out of this file. */
	const SHARED_CLASSES =
		'-mx-px inline-flex size-5 shrink-0 items-center justify-center rounded-full text-caption font-semibold tabular-nums';
	const CURRENT_CLASSES = 'bg-primary text-white';
	const WAITING_CLASSES = 'border-[1.5px] border-input bg-background text-muted-foreground';
</script>

<!--
	The round marker at the start of a draft's setup step in the sidebar: a tick
	once the step is done, otherwise its number, filled in blue on the open page.
	It is hidden from screen readers: the link around it says "done" in words
	(`ManageSidebarLink`), and its number only repeats the step's place.
-->
{#if isDone}
	<span title="Done" aria-hidden="true" class="{SHARED_CLASSES} bg-success-muted text-success">
		<Check size={14} strokeWidth={2.5} />
	</span>
{:else}
	<span aria-hidden="true" class="{SHARED_CLASSES} {isCurrent ? CURRENT_CLASSES : WAITING_CLASSES}">
		{number}
	</span>
{/if}
