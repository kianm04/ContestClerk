<script lang="ts">
	import CheckboxField from '$lib/components/CheckboxField.svelte';
	import FieldError from '$lib/components/FieldError.svelte';
	import { fieldErrorId } from '$lib/form-fields';

	type Props = {
		/** Whether the box is ticked now. */
		isChecked: boolean;
		/** What is wrong, or nothing when the box has been ticked. */
		error?: string;
	};

	let { isChecked, error }: Props = $props();

	/**
	 * The sentence the applicant agrees to, word for word from
	 * `06-features/applications.md`. It is required: without it the organisers
	 * may not read the private half of the profile.
	 */
	const CONSENT_LABEL =
		'The organisers may see my profile details (phone, dietary requirements, emergency contact)';
</script>

<!-- `CheckboxField` carries no message of its own, so the error goes under it,
	under the id every other field in `$lib/components` names its message by, and
	`describedById` is what has a screen reader read the two out together. -->
<div>
	<CheckboxField
		label={CONSENT_LABEL}
		name="consent"
		{isChecked}
		describedById={error ? fieldErrorId('consent') : undefined}
	/>
	<FieldError id={fieldErrorId('consent')} message={error} />
</div>
