<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Building from '@lucide/svelte/icons/building';
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import CountrySelect from '$lib/components/CountrySelect.svelte';
	import FileField from '$lib/components/FileField.svelte';
	import FormActions from '$lib/components/FormActions.svelte';
	import KeyValueList from '$lib/components/KeyValueList.svelte';
	import Section from '$lib/components/Section.svelte';
	import TextArea from '$lib/components/TextArea.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import {
		ORGANIZATION_DESCRIPTION_MAX_LENGTH,
		ORGANIZATION_LOGO_ACCEPTED_TYPES,
		ORGANIZATION_LOGO_MAX_SIZE_MB,
		ORGANIZATION_NAME_MAX_LENGTH,
		type OrganizationDetailsErrors,
		type OrganizationDetailsValues,
		type OrganizationSettings
	} from '$lib/organizations';

	type Props = {
		/** The organisation as it is saved, for the logo and the read-only list. */
		organization: OrganizationSettings;
		/** What the boxes hold: what was last typed, or what is saved. */
		values: OrganizationDetailsValues;
		/** What is wrong with each box, from `validateOrganizationDetails`. */
		errors: OrganizationDetailsErrors;
		/** Owners and admins get the form; a plain member gets the same facts as text. */
		isAdmin: boolean;
	};

	// `$props()` takes the values the page passed in. They arrive again, with
	// fresh contents, every time `load` runs.
	let { organization, values, errors, isAdmin }: Props = $props();

	/*
		The same facts a plain member sees, in the shape `KeyValueList` wants. A
		field the organisation never filled in shows an em dash rather than
		disappearing, so the list says "there is nothing here" instead of leaving
		the reader to wonder. `$derived` builds it again whenever the
		organisation changes.
	*/
	const facts = $derived([
		{ label: 'Name', value: organization.name },
		{ label: 'Description', value: organization.description ?? '—' },
		{ label: 'Country', value: organization.countryName ?? '—' },
		{ label: 'Website', value: organization.websiteUrl ?? '—' }
	]);

	// Sends the form in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before.
	// This form edits the organisation's existing details, so the text fields
	// must not reset. The logo box is different: a browser can never show a
	// chosen file again after a reload either, so `clearChosenLogo` empties
	// just that one box, saved or refused, to match what a reload always did.
	const inPlaceForm = createInPlaceForm({ onSettle: clearChosenLogo });

	function clearChosenLogo(formElement: HTMLFormElement) {
		const logoField = formElement.querySelector<HTMLInputElement>('input[name="logo"]');
		if (logoField) logoField.value = '';
	}
</script>

<Section title="Details" icon={Building} description="This organisation's name, logo and country.">
	{#if isAdmin}
		<!--
			A real `<form method="post">`, so saving works with JavaScript switched
			off. `?/updateDetails` is the action in `+page.server.ts`.
			`enctype="multipart/form-data"` is what lets a file travel with the
			text; without it the browser sends only the file's name.
		-->
		<form
			method="post"
			action="?/updateDetails"
			enctype="multipart/form-data"
			class="flex flex-col gap-4"
			use:enhance={inPlaceForm.submit}
		>
			<div class="flex items-center gap-4">
				<Avatar name={organization.name} imagePath={organization.logoPath} size="lg" />

				<div class="min-w-0 flex-1">
					<FileField
						label="Logo"
						name="logo"
						accept={ORGANIZATION_LOGO_ACCEPTED_TYPES}
						maxSizeMb={ORGANIZATION_LOGO_MAX_SIZE_MB}
						error={errors.logo}
						help="Square works best. Leave it empty to keep the logo you have."
					/>
				</div>
			</div>

			<TextField
				label="Name"
				name="name"
				value={values.name}
				error={errors.name}
				maxLength={ORGANIZATION_NAME_MAX_LENGTH}
				isRequired
			/>

			<TextArea
				label="Description"
				name="description"
				value={values.description}
				error={errors.description}
				maxLength={ORGANIZATION_DESCRIPTION_MAX_LENGTH}
				rows={4}
			/>

			<div class="grid gap-4 md:grid-cols-2">
				<CountrySelect name="countryCode" value={values.countryCode} error={errors.countryCode} />

				<!--
					No `type="url"` on this box, although it holds a web address. The
					browser's own check for that type refuses `thimun.org`, because it
					wants the `https://` part typed as well; the server adds that part
					itself when it is missing (see `readOrganizationDetails`). The
					conference details editor and `/create` both leave it off for the
					same reason.
				-->
				<TextField
					label="Website"
					name="websiteUrl"
					value={values.websiteUrl}
					error={errors.websiteUrl}
					placeholder="thimun.org"
				/>
			</div>

			<FormActions>
				<Button label="Save changes" variant="primary" isLoading={inPlaceForm.isBusy} />
			</FormActions>
		</form>
	{:else}
		<!-- `organization-settings.md`: a plain member sees the values as text and
			no forms at all. -->
		<KeyValueList items={facts} />
	{/if}
</Section>
