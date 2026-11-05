<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import CircleDot from '@lucide/svelte/icons/circle-dot';
	import List from '@lucide/svelte/icons/list';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import SquareCheck from '@lucide/svelte/icons/square-check';
	import TextCursorInput from '@lucide/svelte/icons/text-cursor-input';
	import FieldError from '$lib/components/FieldError.svelte';
	import { Label } from '$lib/components/ui/label';
	import { QUESTION_TYPE_OPTIONS } from '$lib/application-questions';
	import { fieldErrorId, fieldHelpId } from '$lib/form-fields';
	import IconSelect from './IconSelect.svelte';
	import RequiredToggle from './RequiredToggle.svelte';

	type Props = {
		type: string;
		/** `required` or `optional`, as the radio buttons send it. */
		required: string;
		error?: string;
	};

	// `$bindable()` lets the dialog write `bind:type` and `bind:required`, which the preview follows.
	let { type = $bindable(), required = $bindable(), error }: Props = $props();

	/** One line under the dropdown saying what the applicant will see. */
	const TYPE_HELP: Record<string, string> = {
		short_text: 'Applicants will be able to write one line of text.',
		long_text: 'Applicants will be able to write a longer text answer (multiple paragraphs).',
		single_choice: 'Applicants pick one of your options.',
		multiple_choice: 'Applicants pick any number of your options.',
		checkbox: 'One box to tick, such as an agreement.'
	};

	/** The glyph at the left of the dropdown; the board draws a list for "Long answer". */
	const TYPE_ICONS: Record<string, LucideIcon> = {
		short_text: TextCursorInput,
		long_text: List,
		single_choice: CircleDot,
		multiple_choice: ListChecks,
		checkbox: SquareCheck
	};

	// `$derived` picks the icon again whenever the type changes.
	const TypeIcon = $derived(TYPE_ICONS[type] ?? List);
</script>

<!--
	Type and Required side by side, 250 and 229 pixels with 19 between, as the
	board draws them; one above the other on a phone. The type is a
	shadcn dropdown with the type's glyph at its left.
-->
<div class="mt-3 grid gap-x-4.75 gap-y-4 lg:grid-cols-[250fr_229fr]">
	<div class="min-w-0">
		<Label for="type" class="block fs-14 lh-20 font-semibold text-creation-ink-900">Type</Label>
		<div class="mt-1.75">
			<IconSelect
				id="type"
				name="type"
				options={QUESTION_TYPE_OPTIONS}
				icon={TypeIcon}
				class="pl-12 fs-14! data-[size=default]:h-10 [&>svg:last-child]:right-3.5 [&>svg:last-child]:size-4.5"
				describedBy={error ? `${fieldHelpId('type')} ${fieldErrorId('type')}` : fieldHelpId('type')}
				bind:value={type}
			/>
		</div>
		<p id={fieldHelpId('type')} class="mt-2 fs-12 lh-16 text-creation-ink-225">
			{TYPE_HELP[type]}
		</p>
		<FieldError id={fieldErrorId('type')} message={error} />
	</div>
	<RequiredToggle bind:required />
</div>
