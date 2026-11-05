<script lang="ts">
	import { fieldErrorId } from '$lib/form-fields';
	import { openingTimes } from './dialog-dates';
	import DialogDatePicker from './DialogDatePicker.svelte';
	import DialogSelect from './DialogSelect.svelte';
	import SetupField from './SetupField.svelte';

	type Props = {
		/** The saved moment, `YYYY-MM-DDTHH:mm` on the conference's clock, or `''`. */
		opensAt: string;
		error?: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { opensAt, error }: Props = $props();

	// Writable `$derived`s: the day and time picked now, starting from what is saved.
	let day = $derived(opensAt.slice(0, 10));
	let time = $derived(opensAt.slice(11, 16) || '09:00');
	const times = $derived(openingTimes(opensAt.slice(11, 16)));
</script>

<!--
	When "On a specific date" is chosen: a day from the calendar and a time
	from the half hours beside it, sent together as `opensAt`, the
	`YYYY-MM-DDTHH:mm` the server reads. No design draws this; it takes the
	dialog's field sizes and the two columns the choices above sit in (307
	and 260 of the design's pixels), 16 apart, so the time never pushes the
	dialog wider than its box.
-->
<div class="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[307fr_260fr] lg:gap-x-4">
	<SetupField id="opensAt" label="Opening day" {error}>
		<DialogDatePicker
			id="opensAt"
			bind:value={day}
			describedBy={error ? fieldErrorId('opensAt') : undefined}
		/>
	</SetupField>
	<SetupField id="opensAtTime" label="Time">
		<DialogSelect id="opensAtTime" name="opensAtTime" options={times} bind:value={time} />
	</SetupField>
</div>
<input type="hidden" name="opensAt" value={day === '' ? '' : `${day}T${time}`} />
