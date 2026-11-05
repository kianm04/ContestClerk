<script lang="ts">
	import type { AuthorWords, PaperPeopleActions, PaperPerson } from '$lib/committee-papers';
	import { committeePaperDialogUrl, type CommitteePaperDialog } from '$lib/urls';
	import PaperPersonRow from './PaperPersonRow.svelte';
	import PaperSideHeading from './PaperSideHeading.svelte';

	type Props = {
		conferenceSlug: string;
		committeeSlug: string;
		paperId: string;
		/** Every seat on the paper, the lead first. */
		people: PaperPerson[];
		/** "Authors" and "Lead", or THIMUN's words. */
		words: AuthorWords;
		/** What the reader may do here; all false for somebody who only reads the paper. */
		actions: PaperPeopleActions;
		/** "5 of 5" beside the sponsors where the committee caps them, or `null`. */
		count?: string | null;
		/** "5 is the most this committee allows.", from `sponsorCapSentence`, or `null`. */
		capSentence?: string | null;
	};

	let {
		conferenceSlug,
		committeeSlug,
		paperId,
		people,
		words,
		actions,
		count = null,
		capSentence = null
	}: Props = $props();

	// The seats that write the paper. The ones that have signed it are listed once signing opens.
	const authors = $derived(people.filter((person) => person.role === 'author'));

	const hasActions = $derived(
		actions.canAdd || actions.canLeave || actions.canDelete || actions.canWithdraw
	);

	/** The paper's page with one of its dialogs open, such as `?add=1`. */
	function dialogUrl(dialog: CommitteePaperDialog) {
		return committeePaperDialogUrl(conferenceSlug, committeeSlug, paperId, dialog);
	}

	// Small link-blue words, as tall as a finger on a phone.
	const ACTION_CLASSES = 'inline-flex min-h-11 items-center text-small text-link sm:min-h-5';
</script>

<!--
	Who writes the paper, beside its text on a desktop and under it on a
	phone, where the heading is a section title like any other. Each action
	is a link that opens its dialog in the address, so it works without
	JavaScript. The only author has nobody to leave the paper to, and deletes
	it instead while it has never been submitted.
-->
<aside aria-label="The paper's people">
	<PaperSideHeading title={words.heading} {count} />
	<ul>
		<!-- The `(person.seatId)` key lets Svelte keep each row as the list changes. -->
		{#each authors as person (person.seatId)}
			<PaperPersonRow {person} {words} canMakeLead={actions.canHandLead && !person.isMine} />
		{/each}
	</ul>
	{#if capSentence !== null}
		<p class="mt-2 text-small text-muted-foreground">{capSentence}</p>
	{/if}
	{#if hasActions}
		<div class="mt-2 flex flex-wrap gap-x-5">
			{#if actions.canAdd}
				<a href={dialogUrl('add')} class={ACTION_CLASSES}>{words.add}</a>
			{/if}
			{#if actions.canLeave}
				<a href={dialogUrl('leave')} class={ACTION_CLASSES}>Leave</a>
			{:else if actions.canDelete}
				<a href={dialogUrl('delete')} class={ACTION_CLASSES}>Delete paper</a>
			{/if}
			<!-- A paper that has been to the dais is withdrawn rather than deleted. -->
			{#if actions.canWithdraw}
				<a href={dialogUrl('withdraw')} class={ACTION_CLASSES}>Withdraw paper</a>
			{/if}
		</div>
	{/if}
</aside>
