<script lang="ts">
	import { onMount } from 'svelte';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import type { ResolvedPathname } from '$app/types';
	import Flag from '$lib/components/Flag.svelte';
	import type { OrganiserApplicationRow } from '$lib/applications';
	import type { DropTargetDrag } from '$lib/drop-target-drag.svelte';

	type Props = {
		/** The application this card is about. */
		application: OrganiserApplicationRow;
		/** Its review page, where every decision can also be made from the keyboard. */
		reviewHref: ResolvedPathname;
		/** The board's dragging helper, from `createDropTargetDrag()` in `ApplicationsBoard`. */
		drag: DropTargetDrag<OrganiserApplicationRow>;
		/** False for an application no column would take, which then has no handle. */
		isDraggable: boolean;
		/** True while this card is shown in a column the server has not confirmed yet. */
		isPending: boolean;
		/** While a drop is being sent or a panel is open, so nothing new can be picked up. */
		isBusy: boolean;
	};

	let { application, reviewHref, drag, isDraggable, isPending, isBusy }: Props = $props();

	/*
		Whether this component is running in the browser. Dragging needs
		JavaScript, so without it the handle is not drawn at all. `onMount` only
		ever runs in the browser, once Svelte has taken over the page's HTML.
	*/
	let isScriptRunning = $state(false);
	onMount(() => {
		isScriptRunning = true;
	});

	// While this card is dragged, it is left in its column as a faded, dashed
	// gap, and the chip that follows the pointer carries its name (T137).
	const isDragged = $derived(drag.hasMoved && drag.dragged?.id === application.id);

	// The card's border and fading, written out in full so Tailwind can find them.
	const cardStateClasses = $derived.by(() => {
		if (isDragged) return 'border-dashed border-ring opacity-50';
		if (isPending) return 'border-border opacity-60';

		return 'border-border';
	});

	function handlePointerDown(event: PointerEvent) {
		if (isBusy) return;

		drag.handlePointerDown(event, application);
	}
</script>

<li class="flex items-start gap-2 rounded-control border bg-background p-3 {cardStateClasses}">
	<!--
		The six dots a card is dragged by, the same as the allocation grid's. It is
		hidden from the keyboard and from screen readers, and below `md`, because
		the tabs, the bulk bar and the review page already do the same work in a
		way everybody can use. The `on…` attributes pass each pointer event to
		`$lib/drop-target-drag.svelte.ts`.
	-->
	{#if isScriptRunning && isDraggable}
		<button
			type="button"
			tabindex="-1"
			aria-hidden="true"
			title="Drag {application.applicantName} to another column"
			onpointerdown={handlePointerDown}
			onpointermove={drag.handlePointerMove}
			onpointerup={drag.handlePointerUp}
			onpointercancel={drag.handlePointerCancel}
			class="hidden size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-control text-muted-foreground select-none hover:bg-muted hover:text-foreground active:cursor-grabbing md:flex {isBusy
				? 'opacity-60'
				: ''}"
		>
			<GripVertical size={16} strokeWidth={1.75} aria-hidden="true" />
		</button>
	{/if}

	<!--
		No avatar here, unlike the table: four columns side by side leave a card
		too narrow for a picture, a flag and a name, and the name is what an
		organiser reads (T137). The flag keeps to the first line when a long
		name wraps onto a second.
	-->
	<div class="min-w-0 flex-1">
		<p class="flex items-start gap-2 text-dense text-foreground">
			{#if application.countryCode}
				<span class="mt-0.5 flex shrink-0"><Flag countryCode={application.countryCode} /></span>
			{/if}
			<a
				href={reviewHref}
				class="min-w-0 font-medium break-words text-foreground hover:text-link hover:underline"
				>{application.applicantName}</a
			>
		</p>

		<p class="truncate text-small text-muted-foreground">
			{application.seatLabel ?? application.firstPreference ?? application.institutionName ?? ''}
		</p>
	</div>
</li>
