<script lang="ts">
	import Flag from '$lib/components/Flag.svelte';
	import { EMPTY_DELEGATION_LIST_QUERY } from '$lib/delegations';
	import type { DropTargetDrag } from '$lib/drop-target-drag.svelte';
	import { waitingDelegationProgress, waitingDelegationTitle } from '$lib/manage-list-summaries';
	import type { SeatDragSource, TrayDelegation } from '$lib/seat-drop';
	import { manageDelegationReviewUrl, manageDelegationsUrl } from '$lib/urls';
	import SeatDragHandle from './SeatDragHandle.svelte';

	type Props = {
		/** The accepted delegations with fewer seats than they asked for. */
		delegations: TrayDelegation[];
		/** The conference's slug, for the links to the delegations. */
		slug: string;
		/** The grid's dragging helper, from `AllocationBoard`. */
		drag: DropTargetDrag<SeatDragSource>;
		/** While an earlier drop is still being saved. */
		isSaving: boolean;
		/** False for a reader who may not decide applications, who cannot drag a delegation. */
		canAssign: boolean;
	};

	let { delegations, slug, drag, isSaving, canAssign }: Props = $props();

	// The tab of the delegations table that holds the accepted ones, where an
	// organiser can see every group at once. `$derived` builds it again if the
	// conference changes.
	const acceptedDelegationsHref = $derived(
		manageDelegationsUrl(slug, { ...EMPTY_DELEGATION_LIST_QUERY, status: 'accepted' })
	);
</script>

<!--
	The banner above the grid (T131, restyled in the manage redesign): every
	accepted delegation still waiting for seats. From `md` up, dragging one by
	its handle onto a free seat reserves that seat for it. Each name links to
	the delegation's review page, whose seat picker does the same with a
	keyboard, on a phone or without JavaScript; `manageDelegationReviewUrl`
	builds that link with `resolve()` from `$app/paths`.
-->
<aside
	class="rounded-2xl border border-border bg-background px-5 py-3.5"
	aria-labelledby="delegation-tray-heading"
>
	<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
		<h2 id="delegation-tray-heading" class="text-small font-medium text-muted-foreground">
			Waiting for seats
		</h2>
		<a href={acceptedDelegationsHref} class="text-small font-medium text-link hover:underline">
			See the accepted delegations
		</a>
	</div>

	<ul class="flex flex-col">
		<!-- The `(delegation.id)` key lets Svelte reuse rows instead of rebuilding them. -->
		{#each delegations as delegation (delegation.id)}
			<li class="flex items-center gap-3 border-t border-border py-2 first:border-t-0 last:pb-0">
				{#if canAssign}
					<SeatDragHandle
						{drag}
						source={{ kind: 'delegation', delegation }}
						title="Drag {delegation.name} onto a free seat"
						isDisabled={isSaving}
					/>
				{/if}
				<!-- The delegation's flag, when it has one, as the design draws it. -->
				{#if delegation.countryCode}
					<Flag countryCode={delegation.countryCode} />
				{/if}
				<div class="min-w-0 flex-1">
					<a
						href={manageDelegationReviewUrl(slug, delegation.id)}
						class="font-medium text-foreground hover:text-link hover:underline"
					>
						{waitingDelegationTitle(delegation)}
					</a>
					<!-- Only one of the two endings shows: a phone cannot drag. -->
					<p class="text-small text-muted-foreground">
						{waitingDelegationProgress(delegation)}{canAssign ? ' ·' : ''}
						{#if canAssign}
							<span class="hidden md:inline"
								>drag it onto a free seat, or open it to pick seats</span
							>
							<span class="md:hidden">open it to pick seats</span>
						{/if}
					</p>
				</div>
			</li>
		{/each}
	</ul>
</aside>
