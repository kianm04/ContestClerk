<script lang="ts">
	import FieldError from '$lib/components/FieldError.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import {
		DESCRIPTION_MAX_LENGTH,
		TAGLINE_MAX_LENGTH,
		type BasicsErrors
	} from '$lib/creation-basics';
	import { fieldErrorId } from '$lib/form-fields';
	import CharacterCount from './CharacterCount.svelte';
	import { FIELD_CLASSES, LABEL_CLASSES } from './field-classes';
	import NameField from './NameField.svelte';

	type Props = {
		name: string;
		tagline: string;
		description: string;
		errors: BasicsErrors;
		/** Whether the name is still the generated one, for the green pill in its field. */
		isNameGenerated: boolean;
	};

	// `$bindable()` lets the page write `bind:name={name}`: what is typed here
	// goes straight back up to the page, which redraws the preview from it.
	let {
		name = $bindable(),
		tagline = $bindable(),
		description = $bindable(),
		errors,
		isNameGenerated
	}: Props = $props();
</script>

<!--
	The design puts each count under its field. Here it sits at the right end
	of the label's line instead: the design's left column is 72 pixels taller
	than the room above its footer, and these two lines are most of that.
-->
<div class="mt-4">
	<NameField bind:name error={errors.name} isGenerated={isNameGenerated} />
</div>

<div class="mt-4">
	<div class="flex items-baseline justify-between gap-2">
		<Label for="tagline" class={LABEL_CLASSES}>Tagline</Label>
		<CharacterCount length={tagline.length} maximum={TAGLINE_MAX_LENGTH} />
	</div>
	<Input
		id="tagline"
		name="tagline"
		class="{FIELD_CLASSES} mt-1.5 h-10 px-3.5 max-lg:h-11"
		maxlength={TAGLINE_MAX_LENGTH}
		aria-invalid={errors.tagline ? 'true' : undefined}
		aria-describedby={errors.tagline ? fieldErrorId('tagline') : undefined}
		bind:value={tagline}
	/>
	<FieldError id={fieldErrorId('tagline')} message={errors.tagline} />
</div>

<!-- 8 pixels, the design's distance from the tagline's count to this label. -->
<div class="mt-2">
	<div class="flex items-baseline justify-between gap-2">
		<Label for="description" class={LABEL_CLASSES}>Description</Label>
		<CharacterCount length={description.length} maximum={DESCRIPTION_MAX_LENGTH} />
	</div>
	<!--
		`field-sizing-fixed` keeps the design's 120 pixels however much is
		written, so a long description scrolls inside the field instead of
		pushing the step below the bottom of the window.
	-->
	<Textarea
		id="description"
		name="description"
		rows={5}
		class="{FIELD_CLASSES} mt-1.5 field-sizing-fixed h-30 min-h-0 resize-y px-3.5 py-2.5 lh-24 md:lh-24"
		maxlength={DESCRIPTION_MAX_LENGTH}
		aria-invalid={errors.description ? 'true' : undefined}
		aria-describedby={errors.description ? fieldErrorId('description') : undefined}
		bind:value={description}
	/>
	<FieldError id={fieldErrorId('description')} message={errors.description} />
</div>
