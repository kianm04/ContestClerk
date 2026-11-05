<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import FormCheckbox from '$lib/components/FormCheckbox.svelte';
	import ManageDialog from '$lib/components/manage/ManageDialog.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import { fieldId } from '$lib/form-fields';
	import { teamCommitteesLine, teamRoleLabel, type TeamFilter, type TeamPerson } from '$lib/team';
	import { committeeRoleHint, type RoleChoice } from '$lib/team-access';
	import { cn } from '$lib/utils';

	type Props = {
		/** The person whose roles are being changed. */
		person: TeamPerson;
		/** Every role of the conference, each saying whether the reader may tick it. */
		choices: RoleChoice[];
		/** The role filter the list had open, which saving keeps. */
		filter: TeamFilter;
		/** The team page with this dialog closed. */
		closeHref: ResolvedPathname;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { person, choices, filter, closeHref }: Props = $props();

	/*
		The ids of the roles ticked right now: the ones the person holds to begin
		with, and whatever the reader ticks after that. A `$derived` can be
		written to, and starts over when the page arrives with another person.
	*/
	let tickedRoleIds: string[] = $derived(person.roles.map((role) => role.id));

	function handleTick(roleId: string, isChecked: boolean) {
		const others = tickedRoleIds.filter((id) => id !== roleId);
		tickedRoleIds = isChecked ? [...others, roleId] : others;
	}

	// The amber warning when a ticked role works per committee and they have none.
	const hint = $derived(
		committeeRoleHint(
			person,
			choices.map((choice) => choice.role).filter((role) => tickedRoleIds.includes(role.id))
		)
	);

	// "USG delegate affairs · no committees".
	const facts = $derived(
		`${teamRoleLabel(person)} · ${teamCommitteesLine(person) || 'no committees'}`
	);
</script>

<!--
	"Edit roles" on a row of the team list. The dialog lives in the address
	(`?edit=<user id>`), so it opens without JavaScript, and its form is a
	plain post to `?/setRoles`, which redirects back to the list.
-->
<ManageDialog title="Roles for {person.fullName}" description={facts} {closeHref}>
	<form method="post" action="?/setRoles" class="flex flex-col gap-4">
		<input type="hidden" name="userId" value={person.userId} />
		<input type="hidden" name="filter" value={filter} />

		<fieldset>
			<legend class="sr-only">Roles</legend>
			<!--
				One line per role, in the conference's order. A role at or above the
				reader's own is drawn disabled with the reason; a disabled box sends
				nothing, and the server keeps those roles as they were. The
				`(choice.role.id)` key lets Svelte reuse the lines.
			-->
			{#each choices as choice (choice.role.id)}
				{@const boxId = fieldId(`role-${choice.role.id}`)}
				<div class="flex min-h-11 items-center gap-3 border-b border-border">
					<FormCheckbox
						id={boxId}
						name="roleId"
						value={choice.role.id}
						isChecked={tickedRoleIds.includes(choice.role.id)}
						isDisabled={!choice.isGiveable}
						onChange={(isChecked) => handleTick(choice.role.id, isChecked)}
					/>
					<Label
						for={boxId}
						class={cn(
							'flex-1 text-body font-normal',
							choice.isGiveable ? 'cursor-pointer' : 'text-muted-foreground'
						)}
					>
						{choice.role.name}
					</Label>
					<span class="text-small text-muted-foreground">{choice.aside}</span>
				</div>
			{/each}
		</fieldset>

		{#if hint}
			<Notice tone="warning">{hint}</Notice>
		{/if}

		<div class="flex gap-3 pt-1">
			<Button type="submit" size="lg" class="max-lg:h-11">Save roles</Button>
			<Button href={closeHref} variant="outline" size="lg" class="max-lg:h-11">Cancel</Button>
		</div>
	</form>
</ManageDialog>
