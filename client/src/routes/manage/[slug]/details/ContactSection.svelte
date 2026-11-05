<script lang="ts">
	import FieldRow from '$lib/components/manage/FieldRow.svelte';
	import FormSection from '$lib/components/manage/FormSection.svelte';
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
	Four rows of two: how to write and ring the organisers, then the website
	and the networks the conference is on (Trello Jjf34CcP). Every field may be
	left empty, and the public page shows a link only for the ones that are not.
-->
<FormSection title="Contact and links" description="Shown on the public page.">
	<FieldRow columns={2}>
		<TextField
			label="Contact email"
			name="contactEmail"
			type="email"
			value={values.contactEmail}
			error={errors.contactEmail}
			help="Where a reader writes to you."
			isDense
		/>

		<!--
			Plain text rather than `type="tel"`, which browsers do not check anyway;
			the server does, loosely, because numbers are written differently in
			every country. It is kept as typed, spaces and all, so the public page
			shows it the way the organiser wrote it.
		-->
		<TextField
			label="Phone"
			name="contactPhone"
			value={values.contactPhone}
			error={errors.contactPhone}
			help="Where a reader rings you."
			placeholder="+31 6 1234 5678"
			autocomplete="tel"
			isDense
		/>
	</FieldRow>

	<!--
		Plain text inputs rather than `type="url"`. With `type="url"` the browser
		refuses to send `thimun.org`, because it wants the `https://` part typed
		as well. The server adds that part itself when it is missing (see
		`readConferenceEdit`), which is what `routes/create` does too.
	-->
	<FieldRow columns={2}>
		<TextField
			label="Website"
			name="websiteUrl"
			value={values.websiteUrl}
			error={errors.websiteUrl}
			placeholder="thimun.org"
			isDense
		/>

		<TextField
			label="Instagram"
			name="instagramUrl"
			value={values.instagramUrl}
			error={errors.instagramUrl}
			placeholder="instagram.com/thimun"
			isDense
		/>
	</FieldRow>

	<FieldRow columns={2}>
		<TextField
			label="Facebook"
			name="facebookUrl"
			value={values.facebookUrl}
			error={errors.facebookUrl}
			placeholder="facebook.com/thimun"
			isDense
		/>

		<TextField
			label="LinkedIn"
			name="linkedinUrl"
			value={values.linkedinUrl}
			error={errors.linkedinUrl}
			placeholder="linkedin.com/company/thimun"
			isDense
		/>
	</FieldRow>

	<FieldRow columns={2}>
		<TextField
			label="YouTube"
			name="youtubeUrl"
			value={values.youtubeUrl}
			error={errors.youtubeUrl}
			placeholder="youtube.com/@thimun"
			isDense
		/>

		<TextField
			label="TikTok"
			name="tiktokUrl"
			value={values.tiktokUrl}
			error={errors.tiktokUrl}
			placeholder="tiktok.com/@thimun"
			isDense
		/>
	</FieldRow>
</FormSection>
