<script lang="ts">
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
	import { applicationAnswerRows, type MyApplication } from '$lib/applications';
	import type { ApplicationQuestion } from '$lib/application-questions';
	import KeyValueList from '$lib/components/KeyValueList.svelte';
	import Section from '$lib/components/Section.svelte';

	type Props = {
		application: MyApplication;
		/** The conference's own questions, in the order they were asked. */
		questions: ApplicationQuestion[];
		/** The committees the preferences point at, named and in preference order. */
		committeeNames: string[];
	};

	let { application, questions, committeeNames }: Props = $props();

	/*
		`$derived` builds the rows again whenever any of the three props changes.
		The wording of every label and value lives in `$lib/applications.ts`, so it
		can be read and tested without knowing any Svelte.
	*/
	const rows = $derived(applicationAnswerRows(application, questions, committeeNames));
</script>

<Section title="Your answers" icon={ClipboardList}>
	<KeyValueList items={rows} />
</Section>
