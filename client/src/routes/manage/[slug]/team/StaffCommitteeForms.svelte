<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import Button from '$lib/components/Button.svelte';
	import { DENSE_CONTROL_CLASSES, DENSE_LABEL_CLASSES } from '$lib/form-fields';
	import type { TeamCommittee, TeamFilter, TeamPerson } from '$lib/team';

	type Props = {
		/** The staff member these forms act on. */
		person: TeamPerson;
		/** Every committee of this conference, for the picker below. */
		committees: TeamCommittee[];
		/**
		 * Sends a press through the team list's instant form, which changes the
		 * row at once (T142). `StaffRowActions.svelte` passes its own
		 * `handleSubmit`, which also closes the `<details>` panel these forms sit
		 * inside, the way a page reload always used to.
		 */
		onSubmit: SubmitFunction;
		/** The role filter the list has open, which each form sends back so saving keeps it. */
		filter: TeamFilter;
	};

	let { person, committees, onSubmit, filter }: Props = $props();
</script>

<!-- A conference with no committees yet has nothing to assign, and an empty
	picker beside a button that can only be refused would say otherwise. -->
{#if committees.length > 0}
	<form
		method="post"
		action="?/assignCommittee"
		class="flex flex-wrap items-end gap-2"
		use:enhance={onSubmit}
	>
		<input type="hidden" name="userId" value={person.userId} />
		<input type="hidden" name="filter" value={filter} />
		<label class="min-w-40 flex-1">
			<span class={DENSE_LABEL_CLASSES}>Committee</span>
			<!-- Safari lays a select out as wide as its longest option, and a committee
				name can be longer than a phone is wide: the box itself fits, but the
				page scrolled sideways. `overflow-hidden` keeps that width inside the box
				(T163). -->
			<select name="committeeId" class="{DENSE_CONTROL_CLASSES} overflow-hidden">
				<!-- The `(committee.id)` key lets Svelte reuse the options. -->
				{#each committees as committee (committee.id)}
					<option value={committee.id}>{committee.name}</option>
				{/each}
			</select>
		</label>
		<Button label="Assign committee" variant="secondary" size="dense-sm" />
	</form>
{/if}

<!-- One small form per committee this person chairs, because each posts a
	different `committeeId`. Nothing is drawn for somebody who chairs none. -->
<div class="flex flex-wrap gap-2">
	{#each person.committees as committee (committee.id)}
		<form method="post" action="?/unassignCommittee" use:enhance={onSubmit}>
			<input type="hidden" name="userId" value={person.userId} />
			<input type="hidden" name="committeeId" value={committee.id} />
			<input type="hidden" name="filter" value={filter} />
			<Button label="Not chair of {committee.name}" variant="ghost" size="dense-sm" />
		</form>
	{/each}
</div>
