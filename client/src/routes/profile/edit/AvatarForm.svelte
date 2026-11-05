<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Avatar from '$lib/components/Avatar.svelte';
	import Button from '$lib/components/Button.svelte';
	import FileField from '$lib/components/FileField.svelte';
	import FormActions from '$lib/components/FormActions.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import { AVATAR_ACCEPTED_TYPES, AVATAR_MAX_SIZE_MB, type AvatarFormErrors } from '$lib/profiles';

	type Props = {
		/** The name beside the picture: its alt text, and the initials when there is none. */
		fullName: string;
		/** Where the picture sits in the `public-media` bucket, or nothing for initials. */
		avatarPath: string | null;
		/** The one message the file field shows when the last upload was refused. */
		errors: AvatarFormErrors;
	};

	let { fullName, avatarPath, errors }: Props = $props();

	// There is only something to take away once a picture has been uploaded.
	// `$derived` works this out again whenever the prop changes, which it does
	// after an upload, because the page is loaded afresh after every action.
	const hasPhoto = $derived(avatarPath !== null);

	// Sends the form in the background and redraws the page without reloading
	// it (`$lib/in-place-form.svelte.ts`). `use:enhance` in the markup hands the
	// form over; without JavaScript it posts and reloads the page as before.
	//
	// `isResetAfterSave` is normally only for a form that adds something new,
	// not one that edits a value, but the one field here is a file picker: it
	// never shows the picture already saved (see the comment on `FileField`
	// below), so once the file has been uploaded its choice is stale, not a
	// value to keep. A full page reload always cleared it for free; this puts
	// it back the way it was.
	const inPlaceForm = createInPlaceForm({ isResetAfterSave: true });
</script>

<div class="mb-4">
	<h2 class="font-display text-h2 text-brand-900">Photo</h2>
	<p class="mt-1 text-body text-ink-600">Shown beside your name wherever you appear.</p>
</div>

<!--
	`enctype="multipart/form-data"` is what lets a form carry a file at all, and
	`action="?/updateAvatar"` names which of this page's actions it posts to.
	Between them they make this an ordinary HTML form, so the picture can be
	changed with the JavaScript switched off.
-->
<form
	method="post"
	action="?/updateAvatar"
	enctype="multipart/form-data"
	class="flex flex-col gap-4"
	use:enhance={inPlaceForm.submit}
>
	<!-- The picture as it is saved now, so it is clear what a new file replaces. -->
	<Avatar name={fullName} imagePath={avatarPath} size="lg" />

	<!--
		No `currentFileName` is passed: the stored name is a uuid and would tell
		a reader nothing. The picture above is what shows which file is there.
	-->
	<FileField
		label="Photo"
		name="avatar"
		accept={AVATAR_ACCEPTED_TYPES}
		maxSizeMb={AVATAR_MAX_SIZE_MB}
		error={errors.avatar}
	/>

	<FormActions>
		{#if hasPhoto}
			<!--
				`formaction` on a button sends that one button to a different form
				action, so this one posts the form to `?/removeAvatar` while the
				button beside it still goes to `?/updateAvatar`. It is `secondary`
				rather than `danger`, which `03-design/components.md` keeps for the
				destructive actions in a `DangerZone`: a removed picture can be
				uploaded again.
			-->
			<Button
				label="Remove photo"
				variant="secondary"
				formaction="?/removeAvatar"
				isLoading={inPlaceForm.isSending('?/removeAvatar')}
			/>
		{/if}

		<Button
			label="Save photo"
			variant="primary"
			isLoading={inPlaceForm.isSending('?/updateAvatar')}
		/>
	</FormActions>
</form>
