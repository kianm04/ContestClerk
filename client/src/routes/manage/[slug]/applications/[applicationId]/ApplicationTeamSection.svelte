<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import type { TeamSection } from '$lib/application-teams';
	import Button from '$lib/components/Button.svelte';
	import Section from '$lib/components/Section.svelte';
	import SelectField from '$lib/components/SelectField.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import TeamMemberItem from './TeamMemberItem.svelte';

	type Props = {
		team: TeamSection;
		/** Whether the reader holds `decide_applications`; without it the section only reads. */
		canDecide: boolean;
		/** Why the last change to the team was refused, or `null`. */
		error: string | null;
	};

	let { team, canDecide, error }: Props = $props();

	// Sends the form in the background and redraws the page with the answer
	// (`$lib/in-place-form.svelte.ts`). Without JavaScript it posts and reloads.
	const inPlaceForm = createInPlaceForm();
</script>

<!--
	Friends who applied to represent one country together (Trello pZNcdPqU). The
	organiser sees them as one entry, can take a member out, and can put people
	who applied separately together.
-->
<Section title="Team">
	<div class="flex flex-col gap-4">
		{#if team.members.length === 0}
			<p class="text-body text-muted-foreground">Applying alone.</p>
		{:else}
			<!-- Each member's application id is the key, so a row keeps its form when the list changes. -->
			<ul class="flex flex-col border-y border-border">
				{#each team.members as member (member.applicationId)}
					<TeamMemberItem {member} {canDecide} removeAction={team.removeAction} />
				{/each}
			</ul>
		{/if}

		{#if canDecide && team.partnerOptions.length > 0}
			<form
				method="post"
				action={team.addAction}
				class="flex flex-col gap-3"
				use:enhance={inPlaceForm.submit}
			>
				<SelectField
					isDense
					label="Add to team"
					name="partnerApplicationId"
					value=""
					options={team.partnerOptions}
					placeholder="Choose an applicant"
					help="Somebody who applied separately but should be decided with this applicant."
				/>
				<div>
					<Button
						label="Add to team"
						variant="secondary"
						size="dense"
						isLoading={inPlaceForm.isSending(team.addAction)}
					/>
				</div>
			</form>
		{/if}

		{#if error}
			<p class="text-small text-destructive" role="alert">{error}</p>
		{/if}
	</div>
</Section>
