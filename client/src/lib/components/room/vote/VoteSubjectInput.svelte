<script lang="ts">
	import { VOTE_SUBJECT_MAX_LENGTH } from '$lib/votes';
	import SetupRow from './SetupRow.svelte';

	type Props = {
		/** The words beside it: "On" alone, or "Other" under the list of papers. */
		label: string;
		/** What was typed before a refusal, or nothing. */
		value: string;
		error?: string;
		/** Whether the form refuses to send without it, which it does unless a paper may be picked. */
		isRequired: boolean;
		/** Whether the cursor starts in it. */
		isFocused: boolean;
	};

	let { label, value, error, isRequired, isFocused }: Props = $props();
</script>

<!-- The typed subject of a vote, sent as `subject`: anything the list does not name. -->
<SetupRow {label} labelFor="vote-subject" errorId="vote-subject-error" {error}>
	<!-- svelte-ignore a11y_autofocus -->
	<input
		id="vote-subject"
		name="subject"
		type="text"
		{value}
		placeholder="Draft Resolution 1.1"
		maxlength={VOTE_SUBJECT_MAX_LENGTH}
		required={isRequired}
		autofocus={isFocused}
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={error ? 'vote-subject-error' : undefined}
		class="h-11 w-full max-w-[480px] rounded-control border border-line bg-surface px-3 placeholder:text-ink-400 focus:border-transparent focus:outline-2 focus:outline-brand-500"
	/>
</SetupRow>
