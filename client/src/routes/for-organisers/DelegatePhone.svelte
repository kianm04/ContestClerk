<script lang="ts">
	import { flagUrl } from '$lib/media';
	import {
		ROOM_CLOCK,
		ROOM_CLOCK_PERCENT,
		ROOM_COMMITTEE_NAME,
		ROOM_DELEGATE_CODE,
		ROOM_DELEGATE_QUEUE_LINE,
		ROOM_FLOOR_CODE,
		ROOM_FLOOR_NAME
	} from '$lib/organiser-room';
	import { countryName } from '$lib/countries';
	import DelegatePhoneList from './DelegatePhoneList.svelte';

	type Props = {
		/** True draws the speakers' list under the clock, as in the committee room. */
		showsList?: boolean;
	};

	// `$props` hands a component what its parent passed in; `= false` is used
	// when the parent leaves `showsList` out, as the hero picture does.
	let { showsList = false }: Props = $props();
</script>

<!--
	A drawn delegate's phone in the Human Rights Council: who has the floor,
	their clock and a bar of the time left, and a pale blue line saying when
	Japan, the delegate holding the phone, will speak. The committee room adds
	the first three countries on the speakers' list under it.

	Its parents carry the sentence a screen reader hears and hide the whole
	picture from it, so this draws only the phone. The flag's `alt` is empty
	for the same reason. The clock is in the sans and `tabular-nums`; the serif
	names the country, and `opsz` 14 sets it in the sturdier small-size cut.
-->
<div
	class="flex w-full flex-col rounded-[1.375rem] border border-line bg-surface px-3.5 pt-2 pb-4 text-ink-900 shadow-card"
>
	<span class="h-1 w-9 self-center rounded-full bg-line"></span>

	<div class="mt-3 flex flex-col text-caption">
		<span class="font-medium">{ROOM_COMMITTEE_NAME}</span>
		<span class="text-ink-600">{countryName(ROOM_DELEGATE_CODE)}</span>
	</div>

	<div class="mt-3 flex flex-col items-start border-t border-neutral-100 pt-3.5">
		<img
			src={flagUrl(ROOM_FLOOR_CODE, 'md')}
			alt=""
			class="h-7.5 w-10 rounded-[2px] object-cover outline-1 -outline-offset-1 outline-ink-900/10"
		/>
		<span class="mt-2.5 text-caption text-ink-600">Has the floor</span>
		<span class="font-display text-h2 [font-variation-settings:'opsz'_14]">{ROOM_FLOOR_NAME}</span>
		<span class="mt-0.5 text-display-mobile tabular-nums">{ROOM_CLOCK}</span>
		<!-- The bar of the time left: light blue on a paler blue. -->
		<span class="mt-2 h-1 self-stretch overflow-hidden rounded-full bg-brand-50">
			<span class="block h-full rounded-full bg-brand-500" style:width="{ROOM_CLOCK_PERCENT}%"
			></span>
		</span>
	</div>

	<span class="mt-3.5 rounded-lg bg-brand-50 px-2 py-1.5 text-caption font-medium text-brand-900">
		{ROOM_DELEGATE_QUEUE_LINE}
	</span>

	{#if showsList}
		<DelegatePhoneList />
	{/if}
</div>
