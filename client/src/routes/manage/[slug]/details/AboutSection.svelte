<script lang="ts">
	import FormSection from '$lib/components/manage/FormSection.svelte';
	import TextArea from '$lib/components/TextArea.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import type { ConferenceEditErrors, ConferenceEditValues } from '$lib/conference-details';

	type Props = {
		/** What the fields show: the saved details, or what was typed into a refused form. */
		values: ConferenceEditValues;
		/** One message per field that has something wrong with it. */
		errors: ConferenceEditErrors;
	};

	let { values, errors }: Props = $props();
</script>

<!--
	`isDense` draws the compact fields of the manage pages, with sentence-case
	labels. Every field of this editor passes it.
-->
<FormSection title="About" description="The name and the words at the top of the public page.">
	<TextField
		label="Name"
		name="name"
		value={values.name}
		error={errors.name}
		isRequired
		maxLength={120}
		isDense
	/>

	<TextField
		label="Tagline"
		name="tagline"
		value={values.tagline}
		error={errors.tagline}
		help="One line under the name."
		maxLength={120}
		isDense
	/>

	<TextArea
		label="Description"
		name="description"
		value={values.description}
		error={errors.description}
		rows={5}
		maxLength={4000}
		isDense
	/>
</FormSection>
