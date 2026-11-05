<script lang="ts">
	import {
		MAJORITY_OPTIONS,
		METHOD_OPTIONS,
		VOTE_KIND_OPTIONS,
		type VoteFormErrors,
		type VoteFormOption
	} from '$lib/votes';
	import SegmentedChoice from '../SegmentedChoice.svelte';
	import SetupRow from './SetupRow.svelte';

	/** The three choices of the set-up, by the field each one sends. */
	type ChoiceName = 'kind' | 'majority' | 'method';

	type Props = {
		/** What is chosen in each, Substantive, Simple and Count hands at first. */
		choices: Record<ChoiceName, string>;
		/** The message under each choice the server refused. */
		errors: VoteFormErrors;
		/** Called with the choice the chair changed and what they picked. */
		onChange: (name: ChoiceName, value: string) => void;
	};

	let { choices, errors, onChange }: Props = $props();

	/** Type, Majority and Method, in the order the set-up asks for them. */
	const GROUPS: { name: ChoiceName; label: string; options: VoteFormOption[] }[] = [
		{ name: 'kind', label: 'Type', options: VOTE_KIND_OPTIONS },
		{ name: 'majority', label: 'Majority', options: MAJORITY_OPTIONS },
		{ name: 'method', label: 'Method', options: METHOD_OPTIONS }
	];
</script>

<!-- The `(group.name)` key lets Svelte reuse each row instead of rebuilding it. -->
{#each GROUPS as group (group.name)}
	<SetupRow
		label={group.label}
		labelId="vote-{group.name}-label"
		errorId="vote-{group.name}-error"
		error={errors[group.name]}
	>
		<SegmentedChoice
			name={group.name}
			labelledBy="vote-{group.name}-label"
			options={group.options}
			value={choices[group.name]}
			onChange={(value) => onChange(group.name, value)}
		/>
	</SetupRow>
{/each}
