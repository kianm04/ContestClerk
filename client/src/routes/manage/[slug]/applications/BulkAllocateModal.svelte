<script lang="ts">
	import Button from '$lib/components/Button.svelte';
	import Card from '$lib/components/Card.svelte';
	import SelectField, { type SelectOption } from '$lib/components/SelectField.svelte';
	import type { SeatGroup } from '$lib/allocation';
	import type { OrganiserApplicationRow } from '$lib/applications';

	type Props = {
		/** The applicants being accepted, in the table's order. */
		applicants: OrganiserApplicationRow[];
		/** The free seats to offer each of `applicants`, in the same order. */
		suggestions: SeatGroup[][];
		/** The seat already chosen for an application id, so a refused accept keeps it. */
		seatChoices: Record<string, string>;
		/**
		 * Where the button posts to, built by `manageApplicationsActionUrl` so
		 * that the tab and the filters survive the post. See that helper.
		 */
		acceptAction: string;
	};

	let { applicants, suggestions, seatChoices, acceptAction }: Props = $props();

	// The same words on the heading and on the button, so the organiser presses
	// what they were promised. `$derived` counts them again after every action.
	const title = $derived(
		applicants.length === 1 ? 'Accept 1 application' : `Accept ${applicants.length} applications`
	);

	/**
	 * One applicant's free seats as a dropdown offers them, each named
	 * "UNSC · France".
	 *
	 * The groups are flattened into one plain list because `SelectField` takes a
	 * plain list. Nothing is lost by it: `suggestSeats` already put the committees
	 * the applicant asked for at the front, so their own choices come first.
	 */
	function seatOptions(groups: SeatGroup[]): SelectOption[] {
		return groups.flatMap((group) =>
			group.seats.map((seat) => ({
				value: seat.id,
				label: `${group.committeeLabel} · ${seat.name}`
			}))
		);
	}
</script>

<!--
	Drawn inline above the table rather than inside `Modal`, which is a `<dialog>`
	opened by `showModal()` from an `$effect`: without JavaScript that dialog
	would never open, and `05-pages/organiser/applications.md` asks for exactly
	this content inline in that case. Drawing it inline always is one behaviour
	instead of two.
-->
<Card>
	<h2 class="text-h3 text-foreground">{title}</h2>

	<p class="mt-1 text-body text-muted-foreground">
		Choose the seat each applicant takes. Only seats nobody holds are offered.
	</p>

	<ul class="mt-4 flex flex-col gap-4">
		<!-- The `(applicant.id)` key lets Svelte reuse rows instead of rebuilding them. -->
		{#each applicants as applicant, index (applicant.id)}
			<li class="flex flex-col gap-2 md:flex-row md:items-end md:gap-4">
				<!--
					Each applicant carries their own id, so this button acts on exactly
					the people listed here whatever is ticked in the table below. The
					action puts every id through a `Set`, so saying it twice is harmless.
				-->
				<input type="hidden" name="ids" value={applicant.id} />

				<div class="min-w-0 md:flex-1">
					<p class="text-dense font-medium text-foreground">{applicant.applicantName}</p>
					<p class="text-small text-muted-foreground">
						First preference: {applicant.firstPreference ?? '—'}
					</p>
				</div>

				<div class="md:w-80">
					<SelectField
						label="Seat for {applicant.applicantName}"
						name="seat:{applicant.id}"
						value={seatChoices[applicant.id] ?? ''}
						options={seatOptions(suggestions[index])}
						placeholder="Choose a seat"
						isDense
					/>
				</div>
			</li>
		{/each}
	</ul>

	<!--
		No `isLoading`: pressing this changes the screen at once
		(`$lib/instant-form.svelte.ts`), so there is no wait for a spinner to show.
	-->
	<div class="mt-4">
		<Button label={title} variant="primary" size="dense" formaction={acceptAction} />
	</div>
</Card>
