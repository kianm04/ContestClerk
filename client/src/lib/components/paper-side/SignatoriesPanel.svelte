<script lang="ts">
	import type { AuthorWords, PaperPerson } from '$lib/committee-papers';
	import PaperPersonRow from './PaperPersonRow.svelte';
	import PaperSideHeading from './PaperSideHeading.svelte';

	type Props = {
		/** Every seat on the paper; the signatories are picked out here. */
		people: PaperPerson[];
		words: AuthorWords;
		/** Whether the paper takes signatures now, which the empty list says. */
		isOpen: boolean;
		/** "Open for signatures since 17:05.", for an author, over "Close signatures"; or `null`. */
		closeNote?: string | null;
		/** A line for the authors under the list, such as what a returned paper's signatories may do. */
		note?: string | null;
	};

	let { people, words, isOpen, closeNote = null, note = null }: Props = $props();

	const signatories = $derived(people.filter((person) => person.role === 'signatory'));
</script>

<!-- The seats that have signed the paper, in the order they signed. -->
<section aria-label="Signatories">
	<PaperSideHeading
		title="Signatories"
		count={signatories.length === 0 ? null : String(signatories.length)}
	/>
	{#if signatories.length === 0}
		<p class="mt-2 text-small text-muted-foreground">
			{isOpen ? 'None yet.' : 'None until it is open for signatures.'}
		</p>
	{:else}
		<ul>
			<!-- The `(person.seatId)` key lets Svelte keep each row as the list changes. -->
			{#each signatories as person (person.seatId)}
				<PaperPersonRow {person} {words} canMakeLead={false} />
			{/each}
		</ul>
	{/if}
	{#if note !== null}
		<p class="mt-3 text-small text-muted-foreground">{note}</p>
	{/if}
	{#if closeNote !== null}
		<p class="mt-3 text-small text-muted-foreground">{closeNote}</p>
		<!-- A plain form, so closing works without JavaScript. -->
		<form method="post" action="?/closeSignatures">
			<button
				type="submit"
				class="inline-flex min-h-11 cursor-pointer items-center text-small text-link sm:min-h-6"
			>
				Close signatures
			</button>
		</form>
	{/if}
</section>
