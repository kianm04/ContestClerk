<script lang="ts">
	import Clock from '@lucide/svelte/icons/clock';
	import FieldError from '$lib/components/FieldError.svelte';
	import { Label } from '$lib/components/ui/label';
	import { fieldErrorId, fieldHelpId } from '$lib/form-fields';
	import SearchSelectField from './SearchSelectField.svelte';
	import { LABEL_CLASSES } from './where-fields';

	type Props = {
		timezone: string;
		options: { value: string; label: string }[];
		help: string;
		error: string | undefined;
		/** Called when the organiser picks a timezone themselves. */
		onPick: () => void;
	};

	let { timezone = $bindable(), options, help, error, onPick }: Props = $props();
</script>

<!-- The timezone, with a clock at its left and the line under it that says where it came from. -->
<div class="min-w-0">
	<Label for="timezone" class={LABEL_CLASSES}>Timezone</Label>
	<SearchSelectField
		name="timezone"
		bind:value={timezone}
		{options}
		placeholder="Pick a timezone"
		searchLabel="Search timezones"
		icon={Clock}
		describedBy={error ? fieldErrorId('timezone') : fieldHelpId('timezone')}
		isInvalid={Boolean(error)}
		{onPick}
	/>
	<p id={fieldHelpId('timezone')} class="mt-1 fs-14 lh-20 text-creation-ink-225">{help}</p>
	<FieldError id={fieldErrorId('timezone')} message={error} />
</div>
