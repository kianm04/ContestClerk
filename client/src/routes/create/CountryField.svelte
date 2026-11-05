<script lang="ts">
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { COUNTRY_CODES, toCountryOptions } from '$lib/countries';
	import { fieldErrorId } from '$lib/form-fields';

	type Props = {
		/** The chosen code, such as `NL`, or `''` for none yet. */
		value: string;
		error?: string;
		/** The classes of the label beside it, so the two fields' labels match. */
		labelClass: string;
	};

	// `$bindable()` lets the parent write `bind:value`, so it hears each choice.
	let { value = $bindable(), error, labelClass }: Props = $props();

	// Every country by name, worked out once: the list never changes.
	const countryOptions = toCountryOptions(COUNTRY_CODES);

	const chosenName = $derived(
		countryOptions.find((country) => country.code === value)?.name ?? 'Pick a country'
	);
</script>

<!--
	The home country as shadcn's `Select`: a 40 pixel button drawn like the
	fields beside it, which opens a list floating over the page. `name` makes
	it send the chosen code with the form as `organizationCountry`, the name
	`+page.server.ts` reads. The list is drawn in a portal at the end of the
	page, outside the step, so it carries `creation-root` itself to get the
	step's type and colours.
-->
<div>
	<Label for="organizationCountry" class={labelClass}>Home country</Label>
	<Select.Root type="single" name="organizationCountry" bind:value>
		<Select.Trigger
			id="organizationCountry"
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={error ? fieldErrorId('organizationCountry') : undefined}
			class={[
				'mt-1.5 w-full rounded-md bg-white pr-3 pl-3.5 text-base data-[size=default]:h-10 max-lg:min-h-11 [&>svg]:size-4.5',
				value === '' && 'text-creation-ink-100'
			]}
		>
			<span class="truncate">{chosenName}</span>
		</Select.Trigger>
		<Select.Content class="creation-root max-h-80">
			<!-- Each code is different, so it keys the list. -->
			{#each countryOptions as country (country.code)}
				<Select.Item value={country.code} label={country.name} class="max-lg:min-h-11" />
			{/each}
		</Select.Content>
	</Select.Root>
	{#if error}
		<p id={fieldErrorId('organizationCountry')} class="mt-1 fs-14 lh-20 text-creation-red">
			{error}
		</p>
	{/if}
</div>
