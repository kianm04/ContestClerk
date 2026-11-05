<script lang="ts">
	import type { OrganizationFooterData } from '$lib/manage-list';

	type Props = {
		/** One organisation's line, from `organizationFooter` in `$lib/manage-list.ts`. */
		footer: OrganizationFooterData;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { footer }: Props = $props();
</script>

<!--
	A quiet line at the foot of `/manage` saying what the reader is in one
	organisation and whether it can take fees by card, with the links to fix
	that. On a phone the links wrap under the sentence.
-->
<div
	class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-small text-muted-foreground"
>
	<p>{footer.text}</p>

	<p class="inline-flex gap-4">
		<!-- Both links can go to the same page, so the words key them. -->
		{#each footer.links as link (link.label)}
			<a href={link.href} class="font-medium text-link">{link.label}</a>
		{/each}
	</p>
</div>
