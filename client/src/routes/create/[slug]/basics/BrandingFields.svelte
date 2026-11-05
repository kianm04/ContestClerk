<script lang="ts">
	import { imageCaption, isDraftOwnImage, type BasicsErrors } from '$lib/creation-basics';
	import type { CreationDraft } from '$lib/creation-draft';
	import ImagePicker from './ImagePicker.svelte';
	import LinkFields from './LinkFields.svelte';

	type Props = {
		/** The draft as last saved, for its pictures and where they came from. */
		draft: CreationDraft;
		organizationName: string;
		contactEmail: string;
		websiteUrl: string;
		instagramUrl: string;
		errors: BasicsErrors;
		/** What an upload that was refused said, by picture. */
		imageErrors: { logo?: string; banner?: string };
	};

	let {
		draft,
		organizationName,
		contactEmail = $bindable(),
		websiteUrl = $bindable(),
		instagramUrl = $bindable(),
		errors,
		imageErrors
	}: Props = $props();
</script>

<!--
	The design's one row: the logo and the banner 18 pixels apart, a hairline
	36 pixels after them and 24 before the links. On a phone the pictures sit
	side by side and the links go under them.
-->
<div class="mt-4 flex items-start max-lg:flex-col max-lg:gap-4">
	<div class="grid shrink-0 grid-cols-2 gap-4.5 max-lg:w-full lg:flex">
		<ImagePicker
			kind="logo"
			label="Logo"
			imagePath={draft.logoPath}
			caption={imageCaption(
				'logo',
				draft.logoPath,
				draft.prefillSources.logo_path,
				organizationName
			)}
			canRemove={isDraftOwnImage(draft.logoPath, draft.id)}
			error={imageErrors.logo}
		/>
		<ImagePicker
			kind="banner"
			label="Banner image"
			imagePath={draft.bannerPath}
			caption={imageCaption(
				'banner',
				draft.bannerPath,
				draft.prefillSources.banner_path,
				organizationName
			)}
			canRemove={isDraftOwnImage(draft.bannerPath, draft.id)}
			error={imageErrors.banner}
		/>
	</div>
	<div
		aria-hidden="true"
		class="mr-6 ml-9 w-px self-stretch bg-creation-input-border max-lg:hidden"
	></div>
	<div class="min-w-0 flex-1 max-lg:w-full">
		<LinkFields bind:contactEmail bind:websiteUrl bind:instagramUrl {errors} />
	</div>
</div>
