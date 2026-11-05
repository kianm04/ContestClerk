<script lang="ts">
	import ImageIcon from '@lucide/svelte/icons/image';
	import X from '@lucide/svelte/icons/x';
	import FieldError from '$lib/components/FieldError.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import { CONFERENCE_IMAGE_ACCEPTED_TYPES } from '$lib/conference-details';
	import { fieldErrorId } from '$lib/form-fields';
	import { bannerImageUrl, logoImageUrl } from '$lib/media';

	type Props = {
		kind: 'logo' | 'banner';
		/** "Logo" or "Banner image". */
		label: string;
		/** The picture shown, a path in the public bucket, or `null` for none. */
		imagePath: string | null;
		/** Where the picture came from, such as "Using TU Delft branding", read out as its description. */
		caption: string;
		/** Whether "Remove" is offered: only for a picture the draft holds itself. */
		canRemove: boolean;
		error?: string;
	};

	let { kind, label, imagePath, caption, canRemove, error }: Props = $props();

	// The empty forms these controls belong to sit outside the step's form (see
	// `ImageForms.svelte`); the `form` attribute below points each control at one.
	const uploadFormId = $derived(`upload-${kind}`);
	const inputId = $derived(`${kind}-file`);

	/** With JavaScript a chosen file is sent at once, so no Upload button is needed. */
	function sendChosenFile(event: Event & { currentTarget: HTMLInputElement }) {
		// The step's form saves itself on every change; a file is not one of its fields.
		event.stopPropagation();
		event.currentTarget.form?.requestSubmit();
	}
</script>

<!--
	One picture as the design draws it: its name, the picture, and a "Change"
	button as wide as the picture. The logo sits centred in a white box with a
	hairline; the banner fills its box. The logo column is 200 design pixels
	wide and the banner's 220; on a phone they share the width. Until a picture
	is uploaded the box shows the sample one, so the step looks the same before
	and after. The box is 64 pixels tall where the design has 68, to help the
	step fit its window (see `+page.svelte`).
-->
<div class={['min-w-0', kind === 'logo' ? 'lg:w-50' : 'lg:w-55']}>
	<p class="fs-15 lh-20 font-semibold text-creation-ink-900">{label}</p>
	<div class="group relative mt-1.5 h-16">
		{#if kind === 'banner'}
			<img
				src={bannerImageUrl(imagePath)}
				alt={caption || 'Sample banner'}
				class="size-full rounded-md object-cover"
			/>
		{:else}
			<div
				class="flex size-full items-center justify-center rounded-md border border-creation-input-border bg-white"
			>
				<img
					src={logoImageUrl(imagePath)}
					alt={caption || 'Sample logo'}
					class="h-11 max-w-[90%] object-contain"
				/>
			</div>
		{/if}
		{#if canRemove}
			<!--
				Not in the design, so from a laptop up it shows only under the
				pointer or the keyboard (`group-hover` is the box being hovered).
			-->
			<Button
				type="submit"
				variant="outline"
				size="icon-sm"
				form="remove-{kind}"
				class="absolute top-1 right-1 size-6 rounded-full border-creation-input-border bg-white text-creation-ink-600 max-lg:size-11 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
				aria-label="Remove {kind}"
				title="Remove {kind}"
			>
				<X class="size-3.5" />
			</Button>
		{/if}
	</div>
	<!-- A `<label>` for a file input opens the file picker, so it can look like a button. -->
	<label
		for={inputId}
		class="{buttonVariants({
			variant: 'outline'
		})} mt-2 h-8.5 w-full cursor-pointer gap-3 rounded-md border-creation-input-border bg-white fs-15 lh-20 font-semibold text-creation-cancel focus-within:ring-3 hover:bg-creation-field max-lg:h-11"
	>
		<ImageIcon class="size-4.5 text-creation-blue" aria-hidden="true" />
		{imagePath ? 'Change' : `Add ${kind}`}
		<input
			id={inputId}
			type="file"
			name={kind}
			accept={CONFERENCE_IMAGE_ACCEPTED_TYPES}
			form={uploadFormId}
			class="sr-only"
			aria-describedby={error ? fieldErrorId(kind) : undefined}
			onchange={sendChosenFile}
		/>
	</label>
	<noscript>
		<Button
			type="submit"
			variant="outline"
			form={uploadFormId}
			class="mt-2 h-8.5 w-full rounded-md fs-15 max-lg:h-11">Upload</Button
		>
	</noscript>
	<FieldError id={fieldErrorId(kind)} message={error} />
</div>
