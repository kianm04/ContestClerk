<script lang="ts">
	import FieldRow from '$lib/components/manage/FieldRow.svelte';
	import FormSection from '$lib/components/manage/FormSection.svelte';
	import RadioGroup from '$lib/components/RadioGroup.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import {
		OPENING_CHOICE_OPTIONS,
		type ApplicationWindowErrors,
		type ApplicationWindowValues
	} from '$lib/application-form-settings';

	type Props = {
		/** What the fields show: the saved window, or what was typed into a refused form. */
		values: ApplicationWindowValues;
		/** One message per field that has something wrong with it. */
		errors: ApplicationWindowErrors;
		/** The conference's timezone, which every time on the page is read in. */
		timezone: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { values, errors, timezone }: Props = $props();
</script>

<!--
	Fields only, with no form of their own: the page's one settings form wraps
	this section and the two under it, so one press saves all three. The
	timezone is named once, here, as `specs/03-design/writing-style.md` asks.
-->
<FormSection title="When people can apply" description="Times are in {timezone}.">
	<RadioGroup
		legend="Applications open"
		name="opensWhen"
		value={values.opensWhen}
		options={OPENING_CHOICE_OPTIONS}
		isDense
	/>

	<!--
		The opening box is always on the page rather than appearing once "On a
		date I choose" is picked: the page has to work with JavaScript switched
		off, and the server only reads the box for that choice.
	-->
	<FieldRow columns={2}>
		<TextField
			label="Opening time"
			name="applicationsOpenAt"
			value={values.applicationsOpenAt}
			error={errors.applicationsOpenAt}
			type="datetime-local"
			help="Only used when you choose a date."
			isDense
		/>

		<TextField
			label="Applications close"
			name="applicationsCloseAt"
			value={values.applicationsCloseAt}
			error={errors.applicationsCloseAt}
			type="datetime-local"
			isDense
		/>
	</FieldRow>
</FormSection>
