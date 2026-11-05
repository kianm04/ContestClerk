<script lang="ts">
	import { COUNTRY_CODES, toCountryOptions } from '$lib/countries';
	import SelectField from './SelectField.svelte';

	type Props = {
		/** The words above the dropdown. "Country" unless a page needs something else. */
		label?: string;
		/** The name the country code is sent under, such as `countryCode`. */
		name: string;
		/** The code chosen so far, such as `NL`, or `''` for nothing yet. */
		value: string;
		error?: string | null;
		isRequired?: boolean;
		/**
		 * The words on the empty first option. "Pick a country" on a form; a
		 * filter bar passes "Any country", because there the empty choice is a
		 * real answer that means "do not filter by country".
		 */
		placeholder?: string;
		/** Draws the compact field of the management pages (the manage redesign). */
		isDense?: boolean;
	};

	let {
		label = 'Country',
		name,
		value,
		error = null,
		isRequired = false,
		placeholder = 'Pick a country',
		isDense = false
	}: Props = $props();

	/*
		Every country, sorted by name, in the shape `SelectField` wants. This is
		the one component that works country names out in the browser as well as
		on the server: it is given only a code, so there is nothing else to ask.
		See the note at the top of `$lib/countries.ts`.
	*/
	const options = toCountryOptions(COUNTRY_CODES).map((country) => ({
		value: country.code,
		label: country.name
	}));
</script>

<SelectField {label} {name} {value} {options} {error} {isRequired} {placeholder} {isDense} />
