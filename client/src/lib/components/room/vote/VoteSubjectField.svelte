<script lang="ts">
	import { onMount } from 'svelte';
	import FormSelect from '$lib/components/FormSelect.svelte';
	import { VOTE_PAPER_FIELD_HELP, VOTE_PAPER_FIELD_ID, voteSubjectChoices } from '$lib/paper-votes';
	import {
		OTHER_VOTE_SUBJECT,
		type VoteFormErrors,
		type VoteFormValues,
		type VoteSubject
	} from '$lib/votes';
	import SetupRow from './SetupRow.svelte';
	import VoteSubjectInput from './VoteSubjectInput.svelte';

	type Props = {
		/** What may be voted on (`listVoteSubjects`): empty until debate closes or an amendment waits. */
		subjects: VoteSubject[];
		values: VoteFormValues;
		errors: VoteFormErrors;
		/** After "Close debate" passed, the cursor waits in the typed subject. */
		isRoomVoting: boolean;
	};

	let { subjects, values, errors, isRoomVoting }: Props = $props();

	/*
		Whether the page has come to life. `onMount` only runs in the browser, so
		without JavaScript this stays `false` and both fields are drawn: the
		chair picks Other and types, since nothing can hide the typed one.
	*/
	let isScriptRunning = $state(false);
	onMount(() => {
		isScriptRunning = true;
	});

	// The pick so far. A `$derived` can be written to: it starts from `values`
	// and then follows the dropdown, so the typed subject shows for Other.
	let pickedId = $derived(values.paperId);

	const choices = $derived(voteSubjectChoices(subjects));
	const isTypedShown = $derived(!isScriptRunning || pickedId === OTHER_VOTE_SUBJECT);

	function handlePick(value: string) {
		pickedId = value;
	}
</script>

<!--
	"On", what the vote is on. With nothing to list it is the typed subject
	alone, as it always was. Once there is (`voteSubjects`), it is a dropdown
	of the papers by number, then Other, sent as `paperId`; the typed subject
	follows it for Other, and is the only thing sent for one.
-->
{#if subjects.length === 0}
	<VoteSubjectInput
		label="On"
		value={values.subject}
		error={errors.subject}
		isRequired
		isFocused={isRoomVoting}
	/>
{:else}
	<SetupRow
		label="On"
		labelFor={VOTE_PAPER_FIELD_ID}
		errorId="vote-paper-error"
		error={errors.paperId}
	>
		<FormSelect
			id={VOTE_PAPER_FIELD_ID}
			name="paperId"
			value={values.paperId}
			options={choices}
			class="max-w-[480px]"
			onChange={handlePick}
		/>
		{#if !isScriptRunning}
			<p class="mt-1 text-small text-ink-600">{VOTE_PAPER_FIELD_HELP}</p>
		{/if}
	</SetupRow>
	{#if isTypedShown}
		<VoteSubjectInput
			label="Other"
			value={values.subject}
			error={errors.subject}
			isRequired={isScriptRunning}
			isFocused={isScriptRunning}
		/>
	{/if}
{/if}
