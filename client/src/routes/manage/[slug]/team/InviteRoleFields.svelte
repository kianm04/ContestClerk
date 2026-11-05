<script lang="ts">
	import { onMount } from 'svelte';
	import FieldError from '$lib/components/FieldError.svelte';
	import FormSelect, { type FormSelectOption } from '$lib/components/FormSelect.svelte';
	import { Label } from '$lib/components/ui/label';
	import { fieldErrorId, fieldId } from '$lib/form-fields';
	import {
		inviteRoleOptions,
		type InviteFormErrors,
		type InviteFormValues,
		type TeamCommittee,
		type TeamRole
	} from '$lib/team';

	type Props = {
		values: InviteFormValues;
		errors: InviteFormErrors;
		/** Every committee of this conference, for the picker. */
		committees: TeamCommittee[];
		/** The roles the reader may give, the ones below their own, in the conference's order. */
		roles: TeamRole[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { values, errors, committees, roles }: Props = $props();

	// `$derived` builds the choices again whenever the conference's roles change.
	const roleOptions: FormSelectOption[] = $derived(inviteRoleOptions(roles));

	/*
		The role picked so far. A `$derived` can be written to: it starts from the
		posted value and `handleRoleChange` sets it on every pick.
	*/
	let chosenRoleId = $derived(values.roleId);

	function handleRoleChange(roleId: string) {
		chosenRoleId = roleId;
	}

	// Without JavaScript the page cannot follow the pick, so the Committee field
	// is always there. `onMount` runs in the browser only, once it can.
	let isEnhanced = $state(false);
	onMount(() => {
		isEnhanced = true;
	});

	// A committee means something only to a role that works per committee, and
	// such a role needs one (`validateInviteForm`).
	const chosenRole = $derived(roles.find((role) => role.id === chosenRoleId));
	const isCommitteeShown = $derived(!isEnhanced || chosenRole?.scope === 'committees');

	/**
	 * "UNSC · United Nations Security Council", or the full name on its own for a
	 * committee with no short name.
	 *
	 * It stays in this file rather than moving to `$lib` because this picker is
	 * the only place that writes a committee this way; `CommitteeRow.svelte`
	 * builds the same line for its heading.
	 */
	function committeeLabel(committee: TeamCommittee): string {
		if (!committee.abbreviation) {
			return committee.name;
		}

		return `${committee.abbreviation} · ${committee.name}`;
	}

	// `$derived` builds the options again whenever the committee list changes.
	const committeeOptions: FormSelectOption[] = $derived(
		committees.map((committee) => ({ value: committee.id, label: committeeLabel(committee) }))
	);
</script>

<!--
	The invitation's Role and Committee, which belong together: the Committee
	field is there only while the picked role works per committee.
-->
<!-- shadcn's `Select` through `FormSelect`, which sends its choice under
				`name` and is the browser's own dropdown until JavaScript runs. -->
<div class="w-full sm:w-60">
	<Label for={fieldId('roleId')} class="mb-1.5">Role</Label>
	<FormSelect
		id={fieldId('roleId')}
		name="roleId"
		value={values.roleId}
		options={roleOptions}
		placeholder="Pick a role"
		onChange={handleRoleChange}
	/>
	<FieldError id={fieldErrorId('roleId')} message={errors.roleId} />
</div>

{#if isCommitteeShown}
	<div class="w-full sm:w-50">
		<Label for={fieldId('committeeId')} class="mb-1.5">Committee</Label>
		<FormSelect
			id={fieldId('committeeId')}
			name="committeeId"
			value={values.committeeId}
			options={committeeOptions}
			placeholder="No committee"
		/>
		<FieldError id={fieldErrorId('committeeId')} message={errors.committeeId} />
	</div>
{/if}
