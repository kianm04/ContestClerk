<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import FormCheckbox from '$lib/components/FormCheckbox.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import { Label } from '$lib/components/ui/label';
	import { fieldId } from '$lib/form-fields';
	import type { MyPermissions, Permission, RoleScope } from '$lib/permissions';
	import {
		permissionSections,
		ROLE_NAME_MAX_LENGTH,
		type RoleFormErrors,
		type RoleFormValues
	} from '$lib/roles';
	import PermissionGroup from './PermissionGroup.svelte';
	import RoleFormActions from './RoleFormActions.svelte';
	import ScopeRadios from './ScopeRadios.svelte';

	type Props = {
		/** What the form holds: the role as saved, a copied one, or what was just refused. */
		values: RoleFormValues;
		errors: RoleFormErrors;
		/** The reader's own permissions, which decide which boxes they may tick. */
		mine: MyPermissions;
		/** The action the form posts to, such as `?/create`. */
		action: string;
		submitLabel: string;
		deleteHref?: ResolvedPathname | null;
		deleteRefusal?: string | null;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let {
		values,
		errors,
		mine,
		action,
		submitLabel,
		deleteHref = null,
		deleteRefusal = null
	}: Props = $props();

	/*
		The scope and the ticked permissions as the reader changes them. A
		`$derived` can be written to, and starts over from `values` when the page
		arrives with a new answer. The boxes are drawn from these, so ticking
		Administrator ticks and disables the rest at once.
	*/
	let scope: RoleScope = $derived(values.scope);
	let tickedPermissions: Permission[] = $derived(values.permissions);

	const sections = $derived(permissionSections(mine, { scope, permissions: tickedPermissions }));

	function handleTick(key: Permission, isChecked: boolean) {
		const others = tickedPermissions.filter((ticked) => ticked !== key);
		tickedPermissions = isChecked ? [...others, key] : others;
	}

	function handleScopeChange(newScope: RoleScope) {
		scope = newScope;
	}

	const publicBoxId = fieldId('isPublic');
</script>

<!-- One column, 42rem wide, labels above fields; it works without JavaScript. -->
<form method="post" {action} class="flex max-w-2xl flex-col gap-6">
	<TextField
		label="Name"
		name="name"
		value={values.name}
		error={errors.name}
		isRequired
		maxLength={ROLE_NAME_MAX_LENGTH}
		placeholder="Registration desk"
		isDense
	/>

	<ScopeRadios {scope} onChange={handleScopeChange} />

	<div class="flex min-h-11 items-center gap-3">
		<FormCheckbox id={publicBoxId} name="isPublic" value="on" isChecked={values.isPublic} />
		<Label for={publicBoxId} class="text-body font-normal"
			>Shown on the conference’s team page</Label
		>
	</div>

	<!-- The six groups of the catalogue, each a section of its own. -->
	{#each sections as section (section.key)}
		<PermissionGroup {section} onTick={handleTick} />
	{/each}

	<RoleFormActions {submitLabel} {deleteHref} {deleteRefusal} />
</form>
