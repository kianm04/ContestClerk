<script lang="ts">
	import FieldError from '$lib/components/FieldError.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { COUNTRY_CODES, toCountryOptions } from '$lib/countries';
	import type { WhenErrors } from '$lib/creation-when';
	import { fieldErrorId } from '$lib/form-fields';
	import SearchSelectField from './SearchSelectField.svelte';
	import TimezoneField from './TimezoneField.svelte';
	import VenueAddressField from './VenueAddressField.svelte';
	import VenueFields from './VenueFields.svelte';
	import { FIELD_CLASSES, LABEL_CLASSES } from './where-fields';

	type Props = {
		locationMode: string;
		city: string;
		countryCode: string;
		venueName: string;
		venueAddress: string;
		timezone: string;
		timezoneOptions: { value: string; label: string }[];
		/** Whether the organiser picked the timezone, rather than the place. */
		isTimezoneChosen: boolean;
		errors: WhenErrors;
		/** Called when the city or country changes, so the timezone can follow. */
		onPlaceChange: () => void;
		/** Called when the organiser picks a timezone themselves. */
		onTimezonePick: () => void;
	};

	let {
		locationMode,
		city = $bindable(),
		countryCode = $bindable(),
		venueName = $bindable(),
		venueAddress = $bindable(),
		timezone = $bindable(),
		timezoneOptions,
		isTimezoneChosen,
		errors,
		onPlaceChange,
		onTimezonePick
	}: Props = $props();

	// Every country, sorted by name, as the dropdown's choices.
	const countries = toCountryOptions(COUNTRY_CODES).map((country) => ({
		value: country.code,
		label: country.name
	}));
</script>

<!--
	The design's two columns, 22 pixels apart and 10 between the rows, 14 under
	the title row: city and country, then venue and timezone. An online
	conference has no place, so only the timezone is asked. Without JavaScript
	the fields stay as the page was drawn; the server drops a place sent for an
	online conference anyway.
-->
<div class="mt-3.5 grid grid-cols-1 gap-x-5.5 gap-y-2.5 sm:grid-cols-2">
	{#if locationMode !== 'online'}
		<div class="min-w-0">
			<Label for="city" class={LABEL_CLASSES}>City</Label>
			<Input
				id="city"
				name="city"
				placeholder="City"
				class="{FIELD_CLASSES} mt-1"
				bind:value={city}
				oninput={onPlaceChange}
			/>
		</div>
		<div class="min-w-0">
			<Label for="countryCode" class={LABEL_CLASSES}>Country</Label>
			<SearchSelectField
				name="countryCode"
				bind:value={countryCode}
				options={countries}
				placeholder="Pick a country"
				searchLabel="Search countries"
				describedBy={errors.countryCode ? fieldErrorId('countryCode') : undefined}
				isInvalid={Boolean(errors.countryCode)}
				onPick={onPlaceChange}
			/>
			<FieldError id={fieldErrorId('countryCode')} message={errors.countryCode} />
		</div>
		<VenueFields bind:venueName />
	{/if}
	<TimezoneField
		bind:timezone
		options={timezoneOptions}
		help={locationMode === 'online'
			? 'Schedules still need a timezone.'
			: isTimezoneChosen
				? 'Every time of this conference is shown in it.'
				: 'Detected automatically from the location.'}
		error={errors.timezone}
		onPick={onTimezonePick}
	/>
	{#if locationMode !== 'online' && venueName !== ''}
		<VenueAddressField bind:venueAddress />
	{/if}
</div>
{#if locationMode === 'hybrid'}
	<p class="mt-2 fs-14 lh-20 text-creation-ink-225">Online access details can be added later.</p>
{/if}
