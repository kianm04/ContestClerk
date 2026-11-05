<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PageMeta from '$lib/components/shell/PageMeta.svelte';
	import type { PageProps } from './$types';
	import ContentSection from './ContentSection.svelte';
	import DataSection from './DataSection.svelte';
	import FormsSection from './FormsSection.svelte';
	import LayoutSection from './LayoutSection.svelte';
	import MarkdownSection from './MarkdownSection.svelte';
	import OverlaysSection from './OverlaysSection.svelte';
	import RoomSection from './RoomSection.svelte';
	import ShellSection from './ShellSection.svelte';
	import TokensSection from './TokensSection.svelte';

	// `form` is what the action in `+page.server.ts` sent back after the sample
	// form was posted. It is `null` until somebody presses that form's button.
	// `data` is what `load` there returned: only the Markdown editor's sample,
	// so this page never reads the database.
	let { data, form }: PageProps = $props();

	// The contents list. Each id has to match the `id` given to the matching
	// `Group` in the section files, because that is what the link jumps to.
	const GROUPS = [
		{ id: 'tokens', label: 'Tokens' },
		{ id: 'layout', label: 'Layout' },
		{ id: 'content', label: 'Content' },
		{ id: 'forms', label: 'Forms' },
		{ id: 'markdown', label: 'Markdown editor' },
		{ id: 'data', label: 'Data' },
		{ id: 'overlays', label: 'Overlays' },
		{ id: 'shell', label: 'App shell' },
		{ id: 'room', label: 'Committee room' }
	];
</script>

<!-- `PageMeta` writes the `<title>` and the sharing tags, and adds "· MUNMeet". -->
<PageMeta
	title="Styleguide"
	description="Every shared MUNMeet component, in every state, on one page."
/>

<div class="mx-auto grid max-w-[1280px] gap-10">
	<PageHeader
		title="Styleguide"
		subtitle="Every component, every state. Nothing here reads the database."
	/>

	<!-- Sticks to the top of the window so the list is reachable down a long page. -->
	<nav aria-label="Contents" class="sticky top-0 z-20 border-b border-line bg-background py-3">
		<ul class="flex flex-wrap gap-x-4 gap-y-2">
			{#each GROUPS as group (group.id)}
				<li>
					<!-- `min-h-11` is the 44px the design system asks of everything tappable. -->
					<a
						href="#{group.id}"
						class="inline-flex min-h-11 items-center text-small text-brand-700 hover:underline"
					>
						{group.label}
					</a>
				</li>
			{/each}
		</ul>
	</nav>

	<TokensSection />
	<LayoutSection />
	<ContentSection />
	<FormsSection errors={form?.errors ?? null} />
	<MarkdownSection
		sampleMarkdown={data.sampleMarkdown}
		sampleMarkdownHtml={data.sampleMarkdownHtml}
	/>
	<DataSection />
	<OverlaysSection />
	<ShellSection />
	<RoomSection />
</div>
