<script lang="ts">
	import { onMount } from 'svelte';
	import type { LucideIcon } from '@lucide/svelte';
	import FileText from '@lucide/svelte/icons/file-text';
	import Globe from '@lucide/svelte/icons/globe';
	import ShieldPlus from '@lucide/svelte/icons/shield-plus';
	import Stethoscope from '@lucide/svelte/icons/stethoscope';
	import TrendingUp from '@lucide/svelte/icons/trending-up';
	import UsersRound from '@lucide/svelte/icons/users-round';
	import IconCircle from '$lib/components/creation/IconCircle.svelte';
	import {
		findCatalogueCommittee,
		QUICK_TEMPLATES,
		type CatalogueCommittee
	} from '$lib/committee-catalogue';

	type Props = {
		/** Called with the committee whose button was pressed. */
		onpick: (committee: CatalogueCommittee) => void;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { onpick }: Props = $props();

	/** The glyph and the width (as a class, in design pixels) the design gives each button. */
	const LOOKS: Record<string, { icon: LucideIcon; width: string }> = {
		UNSC: { icon: ShieldPlus, width: 'lg:w-24.25' },
		WHO: { icon: Stethoscope, width: 'lg:w-23.75' },
		UNHRC: { icon: UsersRound, width: 'lg:w-27.25' },
		ECOSOC: { icon: TrendingUp, width: 'lg:w-29.25' },
		DISEC: { icon: Globe, width: 'lg:w-25' }
	};

	// The five are looked up once, when the dialog opens.
	const templates = QUICK_TEMPLATES.map(findCatalogueCommittee).filter(
		(committee) => committee !== null
	);

	// The buttons only fill fields in the browser, so they are drawn once
	// JavaScript runs. `onMount` runs once, in the browser only.
	let isMounted = $state(false);
	onMount(() => {
		isMounted = true;
	});
</script>

{#if isMounted}
	<div class="mt-3 rounded-lg bg-creation-note px-3 py-2 lg:mt-2">
		<div class="flex items-center gap-3">
			<IconCircle icon={FileText} class="size-9.5 bg-creation-hover" iconClass="size-5.5" />
			<div>
				<p class="fs-17 lh-20 font-semibold text-creation-ink-950">Quick templates</p>
				<p class="fs-15 lh-18 text-creation-ink-450">
					Use a template to quickly fill in common committee details.
				</p>
			</div>
		</div>
		<div class="mt-1.5 flex flex-wrap gap-3">
			{#each templates as committee (committee.abbreviation)}
				{@const look = LOOKS[committee.abbreviation] ?? { icon: FileText, width: '' }}
				<!-- `type="button"` so pressing one fills the fields rather than sending the form. -->
				<button
					type="button"
					class="flex h-8.5 items-center justify-center gap-3 rounded-md border border-creation-track bg-white px-3 fs-15 lh-20 font-semibold text-creation-ink-950 transition-colors hover:bg-creation-hover max-lg:min-h-11 {look.width}"
					onclick={() => onpick(committee)}
				>
					<look.icon class="size-4.5 shrink-0 text-creation-blue" aria-hidden="true" />
					{committee.abbreviation}
				</button>
			{/each}
		</div>
	</div>
{/if}
