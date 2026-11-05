<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import Clock from '@lucide/svelte/icons/clock';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Users from '@lucide/svelte/icons/users';
	import UsersRound from '@lucide/svelte/icons/users-round';
	import { RadioGroup } from '$lib/components/ui/radio-group';
	import { FEE_KIND_OPTIONS, type FeeKind } from '$lib/creation-setup-forms';
	import ChoiceTile from './ChoiceTile.svelte';

	type Props = {
		kind: FeeKind;
		/** Called with the kind picked, so the dialog can fill in who pays and a name. */
		onchange: (kind: FeeKind) => void;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { kind, onchange }: Props = $props();

	// Writable `$derived`: the kind chosen now, starting from the saved one.
	let chosen = $derived<string>(kind);

	/** The glyph the board draws on each kind's card. */
	const ICONS: Record<FeeKind, LucideIcon> = {
		delegate: UsersRound,
		delegation: Users,
		late: Clock,
		other: Ellipsis
	};

	/** Passes the pick on as a kind; the group only ever holds one of the four. */
	function handleValueChange(value: string) {
		const option = FEE_KIND_OPTIONS.find((candidate) => candidate.value === value);
		if (option !== undefined) onchange(option.value);
	}
</script>

<!--
	Four cards in a row, 10 pixels apart; two to a row on a phone. shadcn's
	`RadioGroup` holds the choice and sends it as `kind`.
-->
<div class="mt-4.5">
	<p id="fee-kind-title" class="fs-14 lh-20 font-semibold text-creation-ink-900">Fee type</p>
	<p id="fee-kind-help" class="fs-12 lh-18 text-creation-ink-225">Choose what this fee is for.</p>
	<RadioGroup
		name="kind"
		aria-labelledby="fee-kind-title"
		aria-describedby="fee-kind-help"
		class="mt-1 grid grid-cols-2 gap-2.5 lg:grid-cols-4"
		bind:value={chosen}
		onValueChange={handleValueChange}
	>
		{#each FEE_KIND_OPTIONS as option (option.value)}
			<!-- The late fee's description runs to three lines, so the board lifts its title to keep the card 118 pixels. -->
			<ChoiceTile
				value={option.value}
				label={option.label}
				description={option.description}
				icon={ICONS[option.value]}
				shape="type"
				titleClass={option.value === 'late' ? 'mt-1' : 'mt-2.5'}
			/>
		{/each}
	</RadioGroup>
</div>
