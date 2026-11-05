<script lang="ts">
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import FieldError from '$lib/components/FieldError.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { NAME_MAX_LENGTH } from '$lib/creation-basics';
	import { fieldErrorId } from '$lib/form-fields';
	import { FIELD_CLASSES, LABEL_CLASSES } from './field-classes';

	type Props = {
		name: string;
		error: string | undefined;
		/** Whether the name is still the generated one rather than the organiser's own. */
		isGenerated: boolean;
	};

	// `$bindable()` lets the page write `bind:name={name}`: what is typed here
	// goes straight back up to the page, which redraws the preview from it.
	let { name = $bindable(), error, isGenerated }: Props = $props();
</script>

<div>
	<Label for="name" class={LABEL_CLASSES}>
		Conference name <span class="text-creation-red-bright" aria-hidden="true">*</span>
	</Label>
	<div class="mt-1.5 flex items-center gap-2.5">
		<!-- `relative` lets the green pill sit inside the field's right end, as the design draws it. -->
		<div class="relative min-w-0 flex-1">
			<Input
				id="name"
				name="name"
				class="{FIELD_CLASSES} h-10 pl-3.5 max-lg:h-11 {isGenerated ? 'pr-32.5' : 'pr-3.5'}"
				required
				maxlength={NAME_MAX_LENGTH}
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={error ? fieldErrorId('name') : undefined}
				bind:value={name}
			/>
			{#if isGenerated}
				<!--
					The pill reads "Generated"; a screen reader hears "Generated name".
					The line break before the hidden word keeps the space between them.
				-->
				<Badge
					variant="outline"
					class="pointer-events-none absolute top-1/2 right-1.5 h-7 -translate-y-1/2 gap-2 rounded-full border-0 bg-creation-green-tint px-3 fs-14 lh-18 font-medium text-creation-green"
				>
					<Sparkles class="size-3.75" aria-hidden="true" />
					Generated
					<span class="sr-only">name</span>
				</Badge>
			{/if}
		</div>
		<!--
			`formaction` sends the step's form to another action than its own, so
			the fields typed so far come along and are saved with the new name.
			`formnovalidate` lets it work while the name is empty.
		-->
		<Button
			type="submit"
			variant="outline"
			class="h-10 w-12 rounded-md border-creation-input-border bg-white text-creation-blue hover:bg-creation-field hover:text-creation-blue max-lg:h-11"
			formaction="?/regenerateName"
			formnovalidate
			aria-label="Regenerate name"
			title="Regenerate name"
		>
			<RefreshCw class="size-5" />
		</Button>
	</div>
	<FieldError id={fieldErrorId('name')} message={error} />
</div>
