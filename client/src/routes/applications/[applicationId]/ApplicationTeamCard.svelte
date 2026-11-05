<script lang="ts">
	// `enhance` is SvelteKit's own way to improve a form that already works.
	import { enhance } from '$app/forms';
	import { TEAM_CODE_MAX_LENGTH, type MyTeam } from '$lib/application-teams';
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import TextField from '$lib/components/TextField.svelte';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';
	import MyTeamDetails from './MyTeamDetails.svelte';

	type Props = {
		/** The team this applicant is in, or `null` when they apply on their own. */
		team: MyTeam | null;
		/** False once the organisers have decided: the team is then only shown. */
		canChangeTeam: boolean;
	};

	let { team, canChangeTeam }: Props = $props();

	// Sends each form in the background and redraws the page with the answer
	// (`$lib/in-place-form.svelte.ts`). Without JavaScript the forms post and
	// reload the page as before.
	const inPlaceForm = createInPlaceForm();
</script>

<!--
	Friends who want to represent one country together each send their own
	application and join one team (Trello pZNcdPqU). The organisers then decide
	the team as one, and give each member that country's seat in a different
	committee.
-->
{#if team !== null || canChangeTeam}
	<Card>
		<div class="flex flex-col gap-4">
			<h2 class="font-display text-h2 text-brand-900">Team</h2>

			{#if team === null}
				<p class="text-small text-ink-600">
					Applying with friends to represent one country? One of you starts a team and the others
					join it with its code.
				</p>

				<form method="post" action="?/startTeam" use:enhance={inPlaceForm.submit}>
					<Button
						label="Start a team"
						variant="secondary"
						size="dense"
						isLoading={inPlaceForm.isSending('?/startTeam')}
					/>
				</form>

				<form
					method="post"
					action="?/joinTeam"
					class="flex flex-col gap-3"
					use:enhance={inPlaceForm.submit}
				>
					<TextField
						isDense
						label="Team code"
						name="code"
						value=""
						autocomplete="off"
						maxLength={TEAM_CODE_MAX_LENGTH}
						help="The six characters a friend's team page shows."
					/>
					<div>
						<Button
							label="Join team"
							variant="secondary"
							size="dense"
							isLoading={inPlaceForm.isSending('?/joinTeam')}
						/>
					</div>
				</form>
			{:else}
				<MyTeamDetails {team} {canChangeTeam} />
			{/if}
		</div>
	</Card>
{/if}
