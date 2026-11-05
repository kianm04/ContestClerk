<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import type { ConferenceListRow } from '$lib/manage-list-row';
	import PhaseBar from './PhaseBar.svelte';

	type Props = {
		/** Everything the row says, worked out by `conferenceListRow` in `$lib/manage-list-row.ts`. */
		row: ConferenceListRow;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { row }: Props = $props();
</script>

<!--
	One conference on `/manage`: its dates, its name and where it is in its
	life, two figures, and the one thing that wants doing with a button for it.
	The four parts sit side by side on a wide screen; `flex-wrap` stacks them on
	a phone, and each `flex-[…]` says how wide a part would like to be.
-->
<li class="flex flex-wrap items-start gap-x-7 gap-y-4 border-b border-border px-1 py-5.5">
	<div class="flex-[0_0_5.75rem]">
		<p class="font-display text-2xl leading-7.5 font-semibold text-foreground tabular-nums">
			{row.dateBlock.days}
		</p>
		<p class="text-small text-muted-foreground">{row.dateBlock.monthAndYear}</p>
	</div>

	<!-- `min-w-0` lets a long name wrap instead of pushing the figures off the row. -->
	<div class="min-w-0 flex-[1_1_18.75rem]">
		{#if row.nameHref}
			<a href={row.nameHref} class="font-display text-xl leading-7 font-semibold text-foreground">
				{row.name}
			</a>
		{:else}
			<p class="font-display text-xl leading-7 font-semibold text-foreground">{row.name}</p>
		{/if}
		<p class="text-small text-muted-foreground">{row.subline}</p>

		<PhaseBar
			phaseNumber={row.phaseNumber}
			phaseName={row.phaseName}
			phaseDetail={row.phaseDetail}
		/>
	</div>

	<div class="flex gap-4">
		<!-- The label names each figure, and a row never shows the same label twice. -->
		{#each row.figures as figure (figure.label)}
			<div class="flex-[0_0_6.5rem]">
				<p class="text-lg leading-6.5 font-semibold text-foreground tabular-nums">{figure.value}</p>
				<p class="text-small text-muted-foreground">{figure.label}</p>
			</div>
		{/each}
	</div>

	<div class="flex flex-[0_1_13.75rem] flex-col items-start gap-2.5">
		{#if row.attention}
			<p class="text-dense text-foreground">{row.attention}</p>
		{/if}

		{#if !row.isOnTeam}
			<p class="text-dense text-muted-foreground">Not on the team</p>
		{/if}

		<div class="flex flex-wrap items-center gap-2">
			{#if row.action}
				<Button
					label={row.action.label}
					variant="secondary"
					size="dense-sm"
					href={row.action.href}
				/>
			{/if}

			<!--
				Only a draft can be deleted. `ConfirmButton` asks first in a dialog,
				or without JavaScript on the `/confirm` page. The slug travels inside
				the dialog, which a closed dialog still sends, so no empty line pushes
				the button under "Continue setup". Grey until the pointer is on it,
				so a red button on every draft does not shout down the list.
			-->
			{#if row.isDeletable}
				<ConfirmButton
					label="Delete"
					confirmTitle="Delete {row.name}?"
					confirmText="Its committees, seats and fees go with it. This cannot be undone."
					formaction="?/deleteDraft"
					variant="quiet-danger"
					size="dense-sm"
					areFieldsInDialog
				>
					<input type="hidden" name="slug" value={row.slug} />
				</ConfirmButton>
			{/if}
		</div>
	</div>
</li>
