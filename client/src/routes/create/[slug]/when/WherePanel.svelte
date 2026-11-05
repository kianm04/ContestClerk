<script lang="ts">
	import MapPin from '@lucide/svelte/icons/map-pin';
	import CreationPanel from '$lib/components/creation/CreationPanel.svelte';
	import type { WhenErrors } from '$lib/creation-when';
	import { timezoneForLocation } from '$lib/location-timezone';
	import LocationFields from './LocationFields.svelte';
	import LocationModeChoice from './LocationModeChoice.svelte';

	type Props = {
		locationMode: string;
		city: string;
		countryCode: string;
		venueName: string;
		venueAddress: string;
		timezone: string;
		timezoneOptions: { value: string; label: string }[];
		/** Whether the saved timezone is one the organiser picked. */
		isTimezoneSaved: boolean;
		errors: WhenErrors;
	};

	let {
		locationMode = $bindable(),
		city = $bindable(),
		countryCode = $bindable(),
		venueName = $bindable(),
		venueAddress = $bindable(),
		timezone = $bindable(),
		timezoneOptions,
		isTimezoneSaved,
		errors
	}: Props = $props();

	// Becomes true once the organiser picks a timezone on this visit as well.
	let isTimezoneChosen = $derived(isTimezoneSaved);

	/**
	 * While the organiser has not picked a timezone, it follows the city and
	 * country, as the server would work it out when saving.
	 */
	function followPlace() {
		const placeTimezone = timezoneForLocation(city, countryCode);
		if (!isTimezoneChosen && placeTimezone !== null) timezone = placeTimezone;
	}
</script>

<!-- The design's second panel: padding 18 and 20, the format choice at the right of its title row. -->
<CreationPanel
	title="Where is it happening?"
	description="Choose the format and location. You can change this later."
	icon={MapPin}
	class="pb-4.5"
>
	<!-- `{#snippet}` hands the panel a piece of markup to draw in its title row. -->
	{#snippet actions()}
		<LocationModeChoice bind:locationMode />
	{/snippet}
	<LocationFields
		{locationMode}
		bind:city
		bind:countryCode
		bind:venueName
		bind:venueAddress
		bind:timezone
		{timezoneOptions}
		{isTimezoneChosen}
		{errors}
		onPlaceChange={followPlace}
		onTimezonePick={() => (isTimezoneChosen = true)}
	/>
</CreationPanel>
