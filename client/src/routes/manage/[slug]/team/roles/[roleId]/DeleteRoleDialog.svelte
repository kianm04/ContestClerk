<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import ManageDialog from '$lib/components/manage/ManageDialog.svelte';
	import { Button } from '$lib/components/ui/button';

	type Props = {
		roleName: string;
		/** The editor without the confirmation, where "Keep the role" goes. */
		closeHref: ResolvedPathname;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { roleName, closeHref }: Props = $props();
</script>

<!--
	The confirmation "Delete role" opens. Only this step is red; the button
	that opened it is a plain outline one. It opens only while nobody holds
	the role and no invitation names it.
-->
<ManageDialog title="Delete {roleName}?" {closeHref}>
	<p class="max-w-md text-body text-foreground">
		Nobody holds this role and no invitation names it. It is removed from the list for good.
	</p>

	<form method="post" action="?/delete" class="flex flex-wrap gap-3 pt-3">
		<Button type="submit" variant="destructive" size="lg" class="max-lg:h-11">Delete role</Button>
		<Button href={closeHref} variant="outline" size="lg" class="max-lg:h-11">Keep the role</Button>
	</form>
</ManageDialog>
