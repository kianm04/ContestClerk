<script lang="ts">
	import ArrowDown from 'carbon-icons-svelte/lib/ArrowDown.svelte';
	import ArrowUp from 'carbon-icons-svelte/lib/ArrowUp.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { RoleTableRow } from '$lib/roles';

	type Props = {
		role: RoleTableRow;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { role }: Props = $props();
</script>

<!--
	"Move up" and "Move down" as one plain form, so reordering works without
	JavaScript. The direction travels in each button's `formaction` query
	string; `+page.server.ts` explains it. An arrow is disabled when the role
	cannot swap that way: the end of the list, or a neighbour the reader may
	not change.
-->
<form method="post" class="flex justify-end gap-2">
	<input type="hidden" name="roleId" value={role.id} />
	<Button
		type="submit"
		variant="outline"
		size="icon-lg"
		class="max-lg:size-11"
		formaction="?/move&direction=up"
		disabled={!role.canMoveUp}
		aria-label="Move {role.name} up"
	>
		<ArrowUp size={16} aria-hidden="true" />
	</Button>
	<Button
		type="submit"
		variant="outline"
		size="icon-lg"
		class="max-lg:size-11"
		formaction="?/move&direction=down"
		disabled={!role.canMoveDown}
		aria-label="Move {role.name} down"
	>
		<ArrowDown size={16} aria-hidden="true" />
	</Button>
</form>
