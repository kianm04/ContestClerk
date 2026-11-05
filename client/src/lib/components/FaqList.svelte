<script lang="ts">
	import type { ResolvedPathname } from '$app/types';

	/** A page of ours that answers the question in more detail. */
	export type FaqLink = {
		/**
		 * Built with a helper from `$lib/urls.ts`; a hand-written string is refused
		 * by the type check.
		 */
		href: ResolvedPathname;
		/** The words of the link, verb first: "Read the privacy policy". */
		label: string;
	};

	/** One question and its answer. */
	export type FaqItem = {
		question: string;
		answer: string;
		/** A link under the answer. Without one the answer stands on its own. */
		link?: FaqLink;
	};

	type Props = {
		items: FaqItem[];
	};

	let { items }: Props = $props();
</script>

<!--
	`<details>` and `<summary>` are the browser's own collapsible block: it
	opens and closes with no JavaScript at all, and the keyboard reaches it
	because the browser makes the summary focusable.
-->
<ul class="divide-y divide-line">
	<!-- Questions have no id of their own, so the place in the list is the key. -->
	{#each items as item, index (index)}
		<li>
			<details>
				<!--
					The padding sits on the `<summary>` rather than on the `<details>`,
					because only the summary is the part a finger taps, and the design
					system asks for 44px of it.
				-->
				<summary class="cursor-pointer py-3 text-h3">{item.question}</summary>
				<p class="mt-2 max-w-prose pb-3 text-body text-ink-600">{item.answer}</p>

				<!--
					The link sits inside the `<details>`, so it is hidden until the
					question is opened. `min-h-11` gives it the 44px a finger needs,
					which is also the space under it, so it needs no padding of its own.
				-->
				{#if item.link}
					<a
						href={item.link.href}
						class="inline-flex min-h-11 items-center text-small text-brand-700 hover:underline"
					>
						{item.link.label} →
					</a>
				{/if}
			</details>
		</li>
	{/each}
</ul>
