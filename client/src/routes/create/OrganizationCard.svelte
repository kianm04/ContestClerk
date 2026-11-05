<script lang="ts">
	import Calendar from '@lucide/svelte/icons/calendar';
	import Landmark from '@lucide/svelte/icons/landmark';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import type { CreationOrganization } from '$lib/creation-draft';
	import { formatDateRange } from '$lib/dates';
	import { publicMediaUrl } from '$lib/media';
	import ChoiceMark from './ChoiceMark.svelte';

	type Props = {
		organization: CreationOrganization;
		/** `/create?organization=<id>`: choosing is following a link, so it works without JavaScript. */
		href: string;
		isChosen: boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { organization, href, isChosen }: Props = $props();

	// `$derived` works these out again whenever the organisation changes.
	const home = $derived([organization.city, organization.countryName].filter(Boolean).join(', '));
	const last = $derived(organization.lastConference);
</script>

<!--
	One organisation to pick from, as the design draws it: a 227 pixel card
	with its logo, the round mark top-right, its name, home and last
	conference. The chosen card has a 2 pixel blue border and a pale blue fill.
	`aria-current` tells a screen reader which card is chosen.
	`data-sveltekit-noscroll` keeps the page where it is when a card is chosen,
	and `data-sveltekit-replacestate` keeps the choices out of the Back button.
-->
<!-- eslint-disable svelte/no-navigation-without-resolve -- built by createWithOrganizationUrl(), which starts from resolve('/create') and adds the query -->
<a
	{href}
	data-sveltekit-noscroll
	data-sveltekit-replacestate
	aria-current={isChosen ? 'true' : undefined}
	class={[
		'relative block h-56.75 overflow-hidden rounded-lg pt-5.5 pr-1.5 pb-4 pl-5 transition-colors duration-150',
		isChosen
			? 'border-2 border-creation-blue-border bg-creation-selected'
			: 'border border-creation-card-border bg-white hover:border-creation-blue-focus'
	]}
>
	<ChoiceMark {isChosen} />
	<!--
		The logo sits in a 72 pixel slot, so every name starts on the same line
		whatever the logo's shape. Without a logo the design draws a building.
	-->
	<span class="flex h-18 items-center">
		{#if organization.logoPath}
			<img
				src={publicMediaUrl(organization.logoPath)}
				alt=""
				class="max-h-19 w-auto max-w-[80%] object-contain"
			/>
		{:else}
			<Landmark aria-hidden="true" class="size-17 text-creation-ink-800" strokeWidth={1.5} />
		{/if}
	</span>
	<span class="mt-3 block truncate pr-5 fs-20 lh-26 font-semibold text-creation-ink-950">
		{organization.name}
	</span>
	{#if home}
		<span class="mt-2 flex items-start gap-2.5 fs-15 lh-21 whitespace-nowrap text-creation-ink-375">
			<MapPin aria-hidden="true" class="size-5 shrink-0 text-creation-ink-650" />{home}
		</span>
	{/if}
	<span class="mt-2 flex items-start gap-2.5 fs-15 lh-21 whitespace-nowrap text-creation-ink-375">
		<Calendar aria-hidden="true" class="size-5 shrink-0 text-creation-ink-650" />
		<span>
			{#if last}
				Last conference:<br />{formatDateRange(last.startDate, last.endDate)}
			{:else}
				No conferences yet
			{/if}
		</span>
	</span>
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
