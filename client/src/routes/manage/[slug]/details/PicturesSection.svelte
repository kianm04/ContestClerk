<script lang="ts">
	import FormSection from '$lib/components/manage/FormSection.svelte';
	import type { ConferenceEditErrors } from '$lib/conference-details';
	import type { Conference } from '$lib/conferences';
	import { publicMediaUrl } from '$lib/media';
	import PictureDropzone from './PictureDropzone.svelte';

	type Props = {
		/** The conference as it is saved now, which is what the two boxes show. */
		conference: Conference;
		/** One message per field that has something wrong with it. */
		errors: ConferenceEditErrors;
		/** The `id` of the page's small form that the "Remove" buttons send. */
		removeFormId: string;
		/** True while the press posting to a given formaction is on its way. */
		isSending: (formAction: string) => boolean;
	};

	let { conference, errors, removeFormId, isSending }: Props = $props();

	const bannerUrl = $derived(conference.bannerPath ? publicMediaUrl(conference.bannerPath) : null);
	const logoUrl = $derived(conference.logoPath ? publicMediaUrl(conference.logoPath) : null);
</script>

<FormSection
	title="Pictures"
	description="Optional. The page uses a plain header until you add a banner."
>
	<div class="flex flex-wrap gap-6">
		<!--
			`{#key}` throws the box away and draws a new one whenever the saved
			picture changes. A save that uploaded a picture, or a press of "Remove",
			then leaves an empty file input behind, rather than the file that was
			just saved, which another "Save changes" would upload a second time.
		-->
		{#key conference.bannerPath}
			<PictureDropzone
				label="Banner"
				name="banner"
				shape="wide"
				fitHint="1600 × 600 fits best."
				savedImageUrl={bannerUrl}
				error={errors.banner}
				{removeFormId}
				{isSending}
			/>
		{/key}

		{#key conference.logoPath}
			<PictureDropzone
				label="Logo"
				name="logo"
				shape="square"
				fitHint="512 × 512 fits best."
				savedImageUrl={logoUrl}
				error={errors.logo}
				{removeFormId}
				{isSending}
			/>
		{/key}
	</div>
</FormSection>
