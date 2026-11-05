<script lang="ts">
	import {
		controlClasses,
		labelClasses,
		fieldDescribedBy,
		fieldErrorId,
		fieldHelpId,
		fieldId
	} from '$lib/form-fields';
	import FieldError from './FieldError.svelte';

	type Props = {
		label: string;
		/** The name the file is sent under. The form needs `enctype="multipart/form-data"`. */
		name: string;
		/**
		 * The HTML `accept` attribute, so the file picker offers the right files.
		 * It may mix types and extensions, as in `application/pdf,.docx`. The
		 * browser is only being helpful here: the server checks the real type.
		 */
		accept: string;
		/** The largest file the server will take, in megabytes. Shown to the reader. */
		maxSizeMb: number;
		error?: string | null;
		help?: string;
		/** The file already uploaded, if there is one. Choosing another replaces it. */
		currentFileName?: string;
		/**
		 * What the field's ids are built from, `name` when left out. A page that
		 * draws the same field once per row gives each row its own, such as
		 * `audience-<document id>`, so every label points at its own box.
		 */
		idKey?: string;
		/** Draws the compact field of the management pages (the manage redesign). */
		isDense?: boolean;
	};

	let {
		label,
		name,
		accept,
		maxSizeMb,
		error = null,
		help,
		currentFileName,
		idKey,
		isDense = false
	}: Props = $props();

	// The ids tie the label, help line and error to the box; see `idKey` above.
	const fieldKey = $derived(idKey ?? name);

	const inputId = $derived(fieldId(fieldKey));
	const describedBy = $derived(
		fieldDescribedBy(fieldKey, { hasHelp: true, hasError: Boolean(error) })
	);

	/* The size limit is always worth saying, so it joins whatever else the page
	   wanted to explain on the one help line. */
	const helpText = $derived(help ? `${help} Up to ${maxSizeMb} MB.` : `Up to ${maxSizeMb} MB.`);
</script>

<div>
	<label for={inputId} class={labelClasses(isDense)}>{label}</label>

	{#if currentFileName}
		<p class="mb-1 text-body text-foreground">
			Now: {currentFileName}
		</p>
	{/if}

	<input
		id={inputId}
		{name}
		{accept}
		type="file"
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={describedBy}
		class={controlClasses(isDense)}
	/>

	<p id={fieldHelpId(fieldKey)} class="mt-1 text-small text-muted-foreground">
		{#if currentFileName}
			Choose a file to replace it. {helpText}
		{:else}
			{helpText}
		{/if}
	</p>

	<FieldError id={fieldErrorId(fieldKey)} message={error} />
</div>
