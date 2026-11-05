<script lang="ts">
	import { Textarea } from '$lib/components/ui/textarea';
	import { fieldErrorId } from '$lib/form-fields';
	import SetupField from './SetupField.svelte';

	type Props = {
		description: string;
		error?: string;
		/** Edit committee draws a taller box, 108 pixels against 84, and a closer counter. */
		isTall?: boolean;
	};

	// `$bindable()` lets the dialog write `bind:description`, which a template fills.
	let { description = $bindable(), error, isTall = false }: Props = $props();

	/** The longest description the committee table takes. */
	const MAX_LENGTH = 4000;
</script>

<SetupField
	id="description"
	label="Description"
	counter="{description.length} / {MAX_LENGTH}"
	class={isTall ? 'mt-3 lg:mt-4.25' : 'mt-3 lg:mt-1.25'}
	controlClass={isTall ? 'mt-1' : undefined}
	counterClass={isTall ? 'mt-1' : undefined}
	{error}
>
	<Textarea
		id="description"
		name="description"
		maxlength={MAX_LENGTH}
		placeholder="Provide a short description of the committee's mandate, focus areas and background. This will be shown to delegates on the public page."
		class={[
			'field-sizing-fixed min-h-0 resize-none rounded-md border-creation-input-border bg-white px-3.5 fs-17 lh-24 text-creation-ink-950 placeholder:text-creation-ink-200 focus-visible:border-2 focus-visible:border-creation-blue-focus focus-visible:px-3.25 focus-visible:ring-0 md:fs-17',
			isTall ? 'h-27 py-2.5 focus-visible:py-2.25' : 'h-21 py-2.25 focus-visible:py-2'
		].join(' ')}
		aria-describedby={error ? fieldErrorId('description') : undefined}
		bind:value={description}
	/>
</SetupField>
