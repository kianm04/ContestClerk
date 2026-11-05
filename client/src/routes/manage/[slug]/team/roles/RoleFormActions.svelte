<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { Button } from '$lib/components/ui/button';

	type Props = {
		/** "Create role" or "Save changes". */
		submitLabel: string;
		/** Where "Delete role" opens its confirmation, or `null` on a new role. */
		deleteHref: ResolvedPathname | null;
		/** Why "Delete role" cannot be pressed yet, or `null` while it can. */
		deleteRefusal: string | null;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { submitLabel, deleteHref, deleteRefusal }: Props = $props();
</script>

<!--
	The form's buttons, left-aligned, the primary one first. "Delete role" is a
	link to the editor with its confirmation open (`?delete=1`), so it works
	without JavaScript; while the role is held it is a disabled button with
	the reason under it.
-->
<div class="flex flex-col gap-2.5 pt-2">
	<div class="flex flex-wrap gap-3">
		<Button type="submit" size="lg" class="max-lg:h-11">{submitLabel}</Button>

		{#if deleteHref && deleteRefusal === null}
			<Button href={deleteHref} variant="outline" size="lg" class="max-lg:h-11">Delete role</Button>
		{:else if deleteHref}
			<Button type="button" variant="outline" size="lg" class="max-lg:h-11" disabled>
				Delete role
			</Button>
		{/if}
	</div>

	{#if deleteHref && deleteRefusal}
		<p class="text-small text-muted-foreground">{deleteRefusal}</p>
	{/if}
</div>
