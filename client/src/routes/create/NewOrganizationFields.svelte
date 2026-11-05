<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import type { CreationStartErrors } from '$lib/creation-start';
	import { fieldErrorId } from '$lib/form-fields';
	import { ORGANIZATION_CITY_MAX_LENGTH, ORGANIZATION_NAME_MAX_LENGTH } from '$lib/organizations';
	import CountryField from './CountryField.svelte';

	type Props = {
		/** What each field holds; the page starts them from a refused send's values. */
		name: string;
		city: string;
		/** A country code such as `NL`, or `''` for none yet. */
		countryCode: string;
		errors: CreationStartErrors;
		/**
		 * Beside the "New organisation" card rather than under a row of cards,
		 * for an account with no organisation yet: two rows, the name across.
		 */
		isBesideCard?: boolean;
	};

	/*
		`$bindable()` lets the page write `bind:name` and so on: what is typed
		goes straight back up, and the page's preview follows it. A binding,
		rather than `value=`, also keeps anything typed before JavaScript
		arrived instead of writing over it when the page comes alive.
	*/
	let {
		name = $bindable(),
		city = $bindable(),
		countryCode = $bindable(),
		errors,
		isBesideCard = false
	}: Props = $props();

	// The classes the design gives a label and a 40 pixel field (the Basics board's).
	const LABEL = 'fs-16 lh-22 font-semibold text-creation-ink-900';
	const FIELD = 'mt-1.5 h-10 rounded-md px-3.5 text-base md:text-base max-lg:min-h-11';
</script>

<!--
	Only what a new organisation needs to exist: a name and where it is based,
	in one row under the cards (or two rows beside the lone card). Its logo,
	links and the rest are added later, on its own settings page.
-->
<div class={['grid content-center gap-3.5', isBesideCard ? 'sm:grid-cols-2' : 'sm:grid-cols-3']}>
	<div class={isBesideCard ? 'sm:col-span-2' : undefined}>
		<Label for="organizationName" class={LABEL}>
			Organisation name <span class="text-creation-red-bright" aria-hidden="true">*</span>
		</Label>
		<Input
			id="organizationName"
			name="organizationName"
			class={FIELD}
			bind:value={name}
			required
			maxlength={ORGANIZATION_NAME_MAX_LENGTH}
			autocomplete="organization"
			aria-invalid={errors.name ? 'true' : undefined}
			aria-describedby={errors.name ? fieldErrorId('organizationName') : undefined}
		/>
		{#if errors.name}
			<p id={fieldErrorId('organizationName')} class="mt-1 fs-14 lh-20 text-creation-red">
				{errors.name}
			</p>
		{/if}
	</div>
	<div>
		<Label for="organizationCity" class={LABEL}>Home city</Label>
		<Input
			id="organizationCity"
			name="organizationCity"
			class={FIELD}
			bind:value={city}
			maxlength={ORGANIZATION_CITY_MAX_LENGTH}
			autocomplete="address-level2"
			aria-invalid={errors.city ? 'true' : undefined}
			aria-describedby={errors.city ? fieldErrorId('organizationCity') : undefined}
		/>
		{#if errors.city}
			<p id={fieldErrorId('organizationCity')} class="mt-1 fs-14 lh-20 text-creation-red">
				{errors.city}
			</p>
		{/if}
	</div>
	<CountryField bind:value={countryCode} error={errors.countryCode} labelClass={LABEL} />
</div>
