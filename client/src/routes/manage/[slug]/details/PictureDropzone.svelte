<script lang="ts">
	import FileCheck from '@lucide/svelte/icons/file-check';
	import Upload from '@lucide/svelte/icons/upload';
	import Button from '$lib/components/Button.svelte';
	import FieldError from '$lib/components/FieldError.svelte';
	import {
		CONFERENCE_IMAGE_ACCEPTED_TYPES,
		CONFERENCE_IMAGE_MAX_SIZE_MB
	} from '$lib/conference-details';
	import { fieldDescribedBy, fieldErrorId, fieldHelpId, fieldId } from '$lib/form-fields';

	type Props = {
		/** The words above the box, such as "Banner". */
		label: string;
		/** The name the file is sent under, `banner` or `logo`. */
		name: 'banner' | 'logo';
		/** A wide box for the banner, a square one for the logo. */
		shape: 'wide' | 'square';
		/** The size that fits best, such as "1600 × 600 fits best." */
		fitHint: string;
		/** Where the picture saved now can be seen, or null when there is none. */
		savedImageUrl: string | null;
		/** What is wrong with the chosen file, if anything. */
		error?: string;
		/** The `id` of the page's small form that "Remove" sends; see `+page.svelte`. */
		removeFormId: string;
		/** True while the press posting to a given formaction is on its way. */
		isSending: (formAction: string) => boolean;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { label, name, shape, fitHint, savedImageUrl, error, removeFormId, isSending }: Props =
		$props();

	/** The sizes of the two boxes, from the design (360 × 136 and 136 × 136). */
	const SHAPE_CLASSES = { wide: 'h-[8.5rem] w-[22.5rem]', square: 'size-[8.5rem]' };

	/** The dashed box. `focus-within` draws the focus ring while the input inside it has focus. */
	const BOX_CLASSES =
		'relative flex max-w-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded-control border border-dashed bg-background px-3 text-center text-small text-muted-foreground focus-within:ring-2 focus-within:ring-ring hover:border-ring';

	const borderColour = $derived(error ? 'border-destructive' : 'border-input');

	// A banner fills its box; a logo is shown whole, with room around it.
	const imageFit = $derived(shape === 'wide' ? 'object-cover' : 'object-contain p-2');
	const removeAction = $derived(`?/removeImage&kind=${name}`);
	const describedBy = $derived(fieldDescribedBy(name, { hasHelp: true, hasError: Boolean(error) }));

	// `$state` makes the box redraw when this changes. It only says which file
	// was chosen; the file itself stays in the input and is sent with the form.
	let chosenFileName: string | null = $state(null);

	function handleFileChange(event: Event & { currentTarget: HTMLInputElement }) {
		const chosenFile = event.currentTarget.files?.[0];
		chosenFileName = chosenFile ? chosenFile.name : null;
	}
</script>

<div class="flex max-w-full flex-col gap-1.5">
	<label for={fieldId(name)} class="text-small font-medium text-foreground">{label}</label>

	<!--
		The real file input lies over the whole box, see-through. A click
		anywhere on the box opens the file picker, and a browser takes a file
		dropped onto a file input by itself, so both work without any script.
	-->
	<div class="{BOX_CLASSES} {SHAPE_CLASSES[shape]} {borderColour}">
		{#if chosenFileName}
			<FileCheck class="size-5 text-success" aria-hidden="true" />
			<span class="max-w-full truncate text-foreground">{chosenFileName}</span>
			<span>Not saved yet</span>
		{:else if savedImageUrl}
			<img
				src={savedImageUrl}
				alt="The {name} saved now"
				class="absolute inset-0 size-full {imageFit}"
			/>
			<span class="absolute bottom-2 rounded-full bg-background px-3 py-1 text-foreground shadow-sm"
				>Replace</span
			>
		{:else}
			<Upload class="size-5" aria-hidden="true" />
			<span>Choose a file or drop it here</span>
		{/if}

		<input
			id={fieldId(name)}
			{name}
			type="file"
			accept={CONFERENCE_IMAGE_ACCEPTED_TYPES}
			aria-invalid={error ? 'true' : undefined}
			aria-describedby={describedBy}
			class="absolute inset-0 size-full cursor-pointer opacity-0"
			onchange={handleFileChange}
		/>
	</div>

	<p id={fieldHelpId(name)} class="text-small text-muted-foreground">
		{fitHint} Up to {CONFERENCE_IMAGE_MAX_SIZE_MB} MB.
	</p>

	<FieldError id={fieldErrorId(name)} message={error} />

	{#if savedImageUrl}
		<div>
			<Button
				label="Remove {name}"
				variant="secondary"
				size="dense-sm"
				form={removeFormId}
				formaction={removeAction}
				isLoading={isSending(removeAction)}
			/>
		</div>
	{/if}
</div>
