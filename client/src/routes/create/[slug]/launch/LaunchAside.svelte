<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import type { CreationPreview } from '$lib/creation-draft';
	import type { LaunchImprovement } from '$lib/creation-readiness';
	import OptionalImprovements from './OptionalImprovements.svelte';
	import PublicPagePreview from './PublicPagePreview.svelte';

	type Props = {
		preview: CreationPreview;
		/** The blue note under the preview about when applications open. */
		applicationsNote: { title: string; text: string };
		/** The conference's public page, which its organisers can already open. */
		publicUrl: ResolvedPathname;
		improvements: LaunchImprovement[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { preview, applicationsNote, publicUrl, improvements }: Props = $props();
</script>

<!--
	The right-hand column of Launch: the public page as it will look, then
	what is worth doing before launch, 13 pixels apart as the design stacks
	them. The suggestions panel is left out once there are none.
-->
<div class="flex flex-col gap-3.25">
	<PublicPagePreview {preview} {applicationsNote} {publicUrl} />
	{#if improvements.length > 0}
		<OptionalImprovements {improvements} />
	{/if}
</div>
