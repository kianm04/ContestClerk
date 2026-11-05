<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LucideIcon } from '@lucide/svelte';
	import type { ResolvedPathname } from '$app/types';
	import Avatar from './Avatar.svelte';

	type Props = {
		/** The heading of the section. */
		title: string;
		/**
		 * An icon component from `@lucide/svelte`, imported one icon at a time:
		 * `import Calendar from '@lucide/svelte/icons/calendar'`. It is a whole
		 * component, not a name, which is why it can be rendered as `<Icon />`.
		 */
		icon?: LucideIcon;
		/**
		 * A conference's logo, drawn where the icon would be, for a section that is
		 * about one conference. Without a picture it shows the initials. Give an
		 * `icon` or a `logo`, not both; the icon wins.
		 */
		logo?: { name: string; imagePath: string | null };
		/** One quiet line under the heading. */
		description?: string;
		/**
		 * Where the "View all" link goes. Without it, no link is shown. Build it
		 * with a helper from `$lib/urls.ts`; a hand-written string is refused.
		 */
		viewAllHref?: ResolvedPathname;
		/** The words of that link. Defaults to "View all". */
		viewAllLabel?: string;
		/**
		 * A second link drawn just before "View all", such as a conference
		 * programme's "Announcements" beside its "Full schedule". Without it,
		 * nothing extra is shown.
		 */
		extraLinkHref?: ResolvedPathname;
		/** The words of that second link. */
		extraLinkLabel?: string;
		/**
		 * Lets the body take whatever height the section has left under its heading
		 * row, for a body that should reach the bottom of a section the home grid has
		 * stretched to the height of its row. The body's top element asks for that
		 * height with `flex-1`. Off by default.
		 */
		fillHeight?: boolean;
		/** The body of the section. */
		children: Snippet;
	};

	/*
		`icon: Icon` renames the prop while unpacking it. Svelte only treats a name
		as a component when it starts with a capital letter, so `<icon />` would
		look for an HTML tag called "icon" and find nothing.
	*/
	let {
		title,
		icon: Icon,
		logo,
		description,
		viewAllHref,
		viewAllLabel = 'View all',
		extraLinkHref,
		extraLinkLabel = '',
		fillHeight = false,
		children
	}: Props = $props();

	/** The look of the heading row's links, shared by both so they match. */
	const LINK_CLASSES =
		'inline-flex min-h-11 shrink-0 items-center text-small text-brand-700 hover:underline';

	/*
		Written out in full so Tailwind can find the classes. `flex flex-col` stacks
		the heading row and the body as a column, so a body marked `flex-1` can
		grow into the space left under the heading. It is only there when asked
		for: in a flex column every child is stretched to the full width, which
		would widen a lone button in another section's body.
	*/
	const sectionClass = $derived(
		fillHeight
			? 'flex flex-col rounded-2xl border border-line bg-surface p-4 md:p-6'
			: 'rounded-2xl border border-line bg-surface p-4 md:p-6'
	);
</script>

<!--
	A `<section>` rather than a `<Card>`, so that a screen reader can list this
	block and jump straight to it. A `<section>` only counts as a landmark when
	it has a name, and its own heading does not give it one, so `aria-label`
	repeats the title. The three classes it shares with `Card` are the card
	shape from the design system.
-->
<!--
	The heading row follows the home mockup (T150): a navy icon on its own
	rather than in a pale chip, the title in the display face, and a grey line
	under the row that separates it from the body.
-->
<section aria-label={title} class={sectionClass}>
	<div class="mb-4 flex items-start justify-between gap-4 border-b border-line pb-3">
		<div class="flex items-start gap-3">
			{#if Icon}
				<span class="flex h-8 shrink-0 items-center text-brand-900">
					<Icon size={26} strokeWidth={1.75} aria-hidden="true" />
				</span>
			{:else if logo}
				<Avatar name={logo.name} imagePath={logo.imagePath} size="md" />
			{/if}

			<div>
				<h2 class="font-display text-h2 text-brand-900">{title}</h2>

				{#if description}
					<p class="max-w-prose text-small text-ink-600">{description}</p>
				{/if}
			</div>
		</div>

		<!-- `flex-wrap` lets the two links stack on a narrow screen rather than
			squeeze the title. -->
		<div class="flex shrink-0 flex-wrap justify-end gap-x-4">
			{#if extraLinkHref}
				<a href={extraLinkHref} class={LINK_CLASSES}>{extraLinkLabel} →</a>
			{/if}

			{#if viewAllHref}
				<a href={viewAllHref} class={LINK_CLASSES}>{viewAllLabel} →</a>
			{/if}
		</div>
	</div>

	{@render children()}
</section>
