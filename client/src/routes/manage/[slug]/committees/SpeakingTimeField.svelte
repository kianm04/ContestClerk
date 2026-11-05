<script lang="ts">
	import TextField from '$lib/components/TextField.svelte';

	type Props = {
		/** What the box shows: the saved time, or what was typed into a refused form. */
		value: string;
		/** Why the server refused the time, if it did. */
		error?: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { value, error }: Props = $props();

	/*
		The shortest and longest speaking time a committee may set, in seconds.
		They give the browser's number box its arrows and its own warning;
		`validateCommitteeForm` checks the same range on the server, which is the
		check that counts.
	*/
	const MINIMUM_SPEAKING_TIME_SECONDS = 30;
	const MAXIMUM_SPEAKING_TIME_SECONDS = 600;
</script>

<!--
	The committee form's default speaking time, on its own so that the form stays
	short enough to read (T137). The form sets it beside the Link field.
-->
<TextField
	label="Default speaking time"
	name="defaultSpeakingTimeSeconds"
	{value}
	{error}
	type="number"
	help="In seconds, when a speakers list is opened."
	min={MINIMUM_SPEAKING_TIME_SECONDS}
	max={MAXIMUM_SPEAKING_TIME_SECONDS}
	isDense
/>
