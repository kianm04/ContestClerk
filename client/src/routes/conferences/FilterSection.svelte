<script lang="ts">
	import type { LucideIcon } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	type Props = {
		/** The section's name, such as "Dates". */
		title: string;
		/** An icon component from `@lucide/svelte`, drawn before the name. */
		icon: LucideIcon;
		/** The filter controls in this section. */
		children: Snippet;
	};

	let { title, icon: Icon, children }: Props = $props();
</script>

<!--
	One headed group of the filter sidebar, after the mockup (Trello WMcXfry0). A
	`<fieldset>` with a `<legend>` is how HTML says "these controls belong
	together", so a screen reader announces "Dates" on entering the group.
-->
<fieldset class="flex min-w-0 flex-col">
	<legend class="mb-2 flex items-center gap-2 text-small font-semibold text-ink-900">
		<Icon size={18} strokeWidth={1.75} class="text-brand-900" aria-hidden="true" />
		{title}
	</legend>

	<!-- `{@render children()}` draws whatever the sidebar put inside this section. -->
	{@render children()}
</fieldset>
