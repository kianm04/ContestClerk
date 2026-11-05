<script lang="ts">
	import { COMMITTEE_LEVEL_OPTIONS, type CommitteeFormErrors } from '$lib/committee-details';
	import { fieldErrorId } from '$lib/form-fields';
	import DialogNumberInput from './DialogNumberInput.svelte';
	import DialogSelect from './DialogSelect.svelte';
	import SetupField from './SetupField.svelte';
	import TopicsField from './TopicsField.svelte';

	type Props = {
		errors: CommitteeFormErrors;
		/** A new committee takes the speaking time its template suggests, unseen. */
		isNew: boolean;
		level: string;
		speakingTime: string;
		topics: string[];
	};

	// `$bindable()` lets the dialog write `bind:level`, `bind:speakingTime` and
	// `bind:topics`, the three of these a catalogue pick changes.
	let {
		errors,
		isNew,
		level = $bindable(),
		speakingTime = $bindable(),
		topics = $bindable()
	}: Props = $props();

	const controlClass = $derived(isNew ? undefined : 'mt-0.75');
</script>

<!--
	Create committee draws level beside topics in 236 and 336 pixel columns.
	Edit committee draws level beside speaking time, in the seats row's columns,
	and topics on a row of its own under them, so the chips have room.
-->
<div
	class={[
		'grid grid-cols-1 gap-y-3',
		isNew
			? 'lg:mt-2.5 lg:grid-cols-[236fr_336fr] lg:gap-x-5.25'
			: 'lg:mt-5 lg:grid-cols-[316fr_318fr] lg:gap-x-6'
	]}
>
	<SetupField id="level" label="Level" error={errors.level} {controlClass}>
		<DialogSelect id="level" name="level" options={COMMITTEE_LEVEL_OPTIONS} bind:value={level} />
	</SetupField>
	{#if isNew}
		<!-- A hidden input is sent with the form but not shown: the template's speaking time. -->
		<input type="hidden" name="defaultSpeakingTimeSeconds" value={speakingTime} />
		<TopicsField bind:topics />
	{:else}
		<SetupField
			id="defaultSpeakingTimeSeconds"
			label="Speaking time (seconds)"
			error={errors.defaultSpeakingTimeSeconds}
			{controlClass}
		>
			<DialogNumberInput
				id="defaultSpeakingTimeSeconds"
				name="defaultSpeakingTimeSeconds"
				min={10}
				hasArrows
				describedBy={errors.defaultSpeakingTimeSeconds
					? fieldErrorId('defaultSpeakingTimeSeconds')
					: undefined}
				bind:value={speakingTime}
			/>
		</SetupField>
	{/if}
</div>
{#if !isNew}
	<div class="mt-3 lg:mt-4.75">
		<TopicsField bind:topics isWide />
	</div>
{/if}
