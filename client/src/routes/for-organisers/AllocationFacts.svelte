<script lang="ts">
	import { ALLOCATION_FACTS } from '$lib/for-organisers';
</script>

<!--
	Three facts in a strip under the seat grid. The strip's background is the
	rule grey and each cell is mist, so the 1px gap between the cells reads as
	a hairline between them, whether they sit in a row or one under another.
	`auto-fit` with `minmax(min(16rem,100%),1fr)` makes as many columns as fit
	at 16rem each, and one on a phone. The facts have no id, so `(fact.title)`
	is the key that tells Svelte which is which.
-->
<ul class="mt-10 grid grid-cols-[repeat(auto-fit,minmax(min(16rem,100%),1fr))] gap-px bg-line">
	{#each ALLOCATION_FACTS as fact (fact.title)}
		<li class="bg-mist px-6 py-3">
			<h3 class="text-h3 text-ink-900">{fact.title}</h3>
			<p class="mt-0.5 text-small text-ink-600">{fact.detail}</p>
		</li>
	{/each}
</ul>
