<script lang="ts">
	import FieldError from '$lib/components/FieldError.svelte';
	import { Textarea } from '$lib/components/ui/textarea';
	import {
		fieldDescribedBy,
		fieldErrorId,
		fieldHelpId,
		fieldId,
		labelClasses
	} from '$lib/form-fields';
	import { AMENDMENT_TEXT_MAX_LENGTH } from '$lib/paper-amendments';

	type Props = {
		label: string;
		/** What the server sent: empty, the amendment's words to change, or what a refused form held. */
		value: string;
		error?: string;
		/** A line under the box, or `null` for none. */
		help: string | null;
	};

	let { label, value, error, help }: Props = $props();

	/*
		What the box holds: the server's words, then whatever is typed.
		`bind:value` keeps letters typed before the page came to life, and
		`sentValue` in between means only different words from the server start
		it over, as `$lib/components/TextField.svelte` explains in full.
	*/
	const sentValue = $derived(value);
	let currentValue = $derived(sentValue);

	const describedBy = $derived(
		fieldDescribedBy('text', { hasHelp: help !== null, hasError: Boolean(error) })
	);
</script>

<!-- The words of the amendment, in Markdown: `++Affirms++` underlines an opening phrase. -->
<div>
	<label for={fieldId('text')} class={labelClasses(true)}>{label}</label>
	<Textarea
		id={fieldId('text')}
		name="text"
		bind:value={currentValue}
		rows={5}
		maxlength={AMENDMENT_TEXT_MAX_LENGTH}
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={describedBy}
	/>
	{#if help}
		<p id={fieldHelpId('text')} class="mt-1 text-small text-muted-foreground">{help}</p>
	{/if}
	<FieldError id={fieldErrorId('text')} message={error} />
</div>
