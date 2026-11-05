<script lang="ts">
	import { onMount } from 'svelte';
	import TextField from '$lib/components/TextField.svelte';
	import {
		LONGEST_AGENDA,
		LONGEST_COMMITTEE_NAME,
		type QuickSessionDraft,
		type QuickSessionErrors
	} from '$lib/quick-session';

	type Props = {
		/** The draft whose name, agenda and speaking time the fields start with. */
		values: QuickSessionDraft;
		/** The messages of a refused "Start session", each shown under its field. */
		errors: QuickSessionErrors;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { values, errors }: Props = $props();

	/*
		The browser's own timezone, so the quick session's first day is today
		where the chair is. The server cannot know it, so the hidden field starts
		empty, which the server reads as the database's default.

		`onMount` only ever runs in the browser, once Svelte has taken over the
		page, and is the place to ask `Intl` which zone the computer is set to.
		Asked on the server, it would answer the server's own zone.
	*/
	let browserTimezone = $state('');

	onMount(() => {
		browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	});
</script>

<!--
	The committee's name, its agenda and the speaking time on one row, each
	label above its field as setup forms have them; stacked on a phone. The
	agenda takes the most room, the speaking time the least, as in the study.
-->
<div
	class="grid shrink-0 gap-4 border-b border-line px-8 pt-7 pb-6 max-md:px-4 max-md:pt-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_8rem]"
>
	<TextField
		label="Committee name"
		name="name"
		value={values.name}
		error={errors.name}
		maxLength={LONGEST_COMMITTEE_NAME}
		autocomplete="off"
	/>
	<TextField
		label="Agenda, optional"
		name="agenda"
		value={values.agenda}
		error={errors.agenda}
		maxLength={LONGEST_AGENDA}
		autocomplete="off"
	/>
	<TextField
		label="Speaking time"
		name="speakingTime"
		value={values.speakingTime}
		error={errors.speakingTime}
		autocomplete="off"
	/>
	<input type="hidden" name="timezone" value={browserTimezone} />
</div>
