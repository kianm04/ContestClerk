<script lang="ts">
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
	import MapPin from '@lucide/svelte/icons/map-pin';
	import FormSelect from '$lib/components/FormSelect.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Label } from '$lib/components/ui/label';
	import type { ConferenceQuery } from '$lib/conferences';
	import type { CountryOption } from '$lib/countries';
	import { fieldId } from '$lib/form-fields';
	import { REGION_OPTIONS } from '$lib/regions';
	import { conferenceListUrl } from '$lib/urls';
	import DateWindowRadios from './DateWindowRadios.svelte';
	import FilterCheckbox from './FilterCheckbox.svelte';
	import FilterSection from './FilterSection.svelte';

	type Props = {
		/** The filters the results on screen were built from, so each control shows its own. */
		query: ConferenceQuery;
		/** Every country that has a conference. */
		countries: CountryOption[];
	};

	let { query, countries }: Props = $props();

	const countryId = fieldId('country');

	// A country is stored as `{ code, name }` and the dropdown wants
	// `{ value, label }`, so the list is turned round here. `$derived` does it
	// again whenever `countries` changes. The empty first choice is what
	// `parseConferenceQuery` reads back as "any country".
	const countryOptions = $derived([
		{ value: '', label: 'Any country' },
		...countries.map((country) => ({ value: country.code, label: country.name }))
	]);
</script>

<!--
	The card of filters down the left of the results, after the mockup (Trello
	WMcXfry0): a shadcn `Card` with the mockup's rounder corners. On a desktop its
	sections run down the card; on a tablet, where the card sits above the
	results, they stand side by side (`md:grid-cols-3`).
-->
<Card.Root class="rounded-2xl py-5">
	<Card.Content class="grid gap-6 px-5 md:grid-cols-3 lg:grid-cols-1">
		<FilterSection title="Dates" icon={CalendarDays}>
			<DateWindowRadios withinMonths={query.withinMonths} />
		</FilterSection>

		<FilterSection title="Location" icon={MapPin}>
			<div class="mb-2 flex flex-col gap-1.5">
				<Label for={countryId} class="text-muted-foreground">Country</Label>
				<FormSelect id={countryId} name="country" value={query.country} options={countryOptions} />
			</div>

			<!-- The `(option.value)` key lets Svelte reuse the lines instead of rebuilding them. -->
			{#each REGION_OPTIONS as option (option.value)}
				<FilterCheckbox
					name="region"
					value={option.value}
					label={option.label}
					isChecked={query.regions.includes(option.value)}
				/>
			{/each}
		</FilterSection>

		<FilterSection title="Applications" icon={ClipboardCheck}>
			<FilterCheckbox
				name="open"
				value="1"
				label="Open for applications"
				isChecked={query.openOnly}
			/>
		</FilterSection>

		<!--
			The same list with no filters on it, so every control above goes back to
			empty: a shadcn `Button` given an `href` is a link, and `link` draws it as
			plain words. `justify-start` keeps the words at the card's left edge.
		-->
		<Button
			href={conferenceListUrl()}
			variant="link"
			class="h-11 justify-start px-0 md:col-span-3 lg:col-span-1"
		>
			Reset
		</Button>
	</Card.Content>
</Card.Root>
