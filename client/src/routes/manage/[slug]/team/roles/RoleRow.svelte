<script lang="ts">
	import type { RoleTableRow } from '$lib/roles';
	import { roleScopeWords } from '$lib/team-access';
	import RoleMoveForm from './RoleMoveForm.svelte';
	import RoleName from './RoleName.svelte';

	type Props = {
		role: RoleTableRow;
		conferenceSlug: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { role, conferenceSlug }: Props = $props();
</script>

<!-- One row of the roles table; `RoleCard` is the same role on a phone. -->
<tr class="border-b border-border text-dense">
	<td class="p-3"><RoleName {role} {conferenceSlug} /></td>
	<td class="p-3 text-foreground">{roleScopeWords(role.scope)}</td>
	<td class="p-3 text-right text-foreground tabular-nums">{role.memberCount}</td>
	<td class="p-3 text-muted-foreground">{role.isPublic ? 'Shown on team page' : ''}</td>
	<td class="p-3">
		{#if role.canEdit}
			<RoleMoveForm {role} />
		{/if}
	</td>
</tr>
