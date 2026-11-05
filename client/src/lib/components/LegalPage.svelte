<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import type { LegalSection } from '$lib/legal-text';

	type Props = {
		/** The document's name, such as "Terms of service". */
		title: string;
		/** The day it last changed, written out: "15 September 2026". */
		lastUpdated: string;
		/** The sections, in reading order. The contents list is built from these. */
		sections: LegalSection[];
	};

	// `$props()` unpacks what the page passed in. See the reference component at
	// the bottom of `CLAUDE.md`.
	let { title, lastUpdated, sections }: Props = $props();
</script>

<div class="mb-6">
	<PageHeader {title} subtitle="Last updated {lastUpdated}" />
</div>

<!--
	The contents list is written before the prose, so on a phone it reads first.
	From `md` up the grid moves it into a narrow column beside the prose, where
	it sticks to the top of the window as the prose scrolls past. `self-start`
	is what lets it stick: a grid column otherwise stretches to the full height
	of the row, leaving nothing for `sticky` to move it within.
-->
<div class="grid gap-8 md:grid-cols-[14rem_1fr]">
	<nav aria-label="Contents" class="md:sticky md:top-4 md:self-start">
		<p class="text-label text-ink-600 uppercase">Contents</p>

		<ul>
			<!-- The `(section.id)` key lets Svelte reuse the links instead of rebuilding them. -->
			{#each sections as section (section.id)}
				<li>
					<!--
						A plain `#id` anchor, which the browser jumps to on its own, so the
						list works with JavaScript switched off.
					-->
					<a
						href="#{section.id}"
						class="inline-flex min-h-11 items-center text-small text-brand-700 hover:underline"
					>
						{section.heading}
					</a>
				</li>
			{/each}
		</ul>
	</nav>

	<article class="max-w-prose">
		{#each sections as section (section.id)}
			<!--
				A `<section>` only counts as a landmark a screen reader can jump to
				when it has a name, and `aria-labelledby` gives it the heading's own
				words rather than repeating them in an attribute.
			-->
			<section aria-labelledby={section.id} class="mb-8">
				<!--
					The `id` does two jobs: the matching link in the contents list
					jumps to it, and `aria-labelledby` above names the section with it.
				-->
				<h2 id={section.id} class="font-display text-h2 text-brand-900">{section.heading}</h2>

				<!-- Paragraphs have no id of their own, so their place in the list is the key. -->
				{#each section.paragraphs as paragraph, index (index)}
					<p class="mt-3 text-body text-ink-600">{paragraph}</p>
				{/each}

				{#if section.table}
					<!-- `{@const}` names a value for the rest of the block it sits in. -->
					{@const table = section.table}

					<table class="mt-4 w-full border-collapse text-left">
						<thead>
							<tr class="border-b border-line">
								{#each table.columns as column (column)}
									<th scope="col" class="py-2 pr-4 text-label text-ink-600 uppercase">{column}</th>
								{/each}
							</tr>
						</thead>

						<tbody>
							{#each table.rows as row (row.who)}
								<tr class="border-b border-line">
									<td class="py-2 pr-4 align-top text-body">{row.who}</td>
									<td class="py-2 align-top text-body text-ink-600">{row.sees}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}

				{#if section.link}
					<a
						href={section.link.href}
						class="mt-3 inline-flex min-h-11 items-center text-body text-brand-700 hover:underline"
					>
						{section.link.label}
					</a>
				{/if}
			</section>
		{/each}
	</article>
</div>
