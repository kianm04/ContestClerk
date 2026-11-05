<script lang="ts">
	import SelectField, { type SelectOption } from '$lib/components/SelectField.svelte';
	import type { CommitteeChoice } from '$lib/applications';

	type Props = {
		/** The committees to choose between, in the organiser's own order. */
		committees: CommitteeChoice[];
		/** How many selects to draw. Nothing at all is drawn when it is 0. */
		count: number;
		/** What each select holds now, one entry per select. */
		values: string[];
		/** One message per select, in the same order; `''` where that select is fine. */
		errors: string[];
	};

	let { committees, count, values, errors }: Props = $props();

	/**
	 * The words above each select. A conference may ask for at most three
	 * preferences, which is what `committee_preference_count` allows.
	 */
	const CHOICE_LABELS = ['First choice of committee', 'Second choice', 'Third choice'];

	// `$derived` works both of these out again whenever the props change.
	const labels = $derived(CHOICE_LABELS.slice(0, count));

	// The committees as a dropdown shows them: "UNSC · United Nations Security
	// Council" for a committee with a short name, and the plain name for one
	// without.
	const options: SelectOption[] = $derived(
		committees.map((committee) => ({
			value: committee.id,
			label:
				committee.abbreviation === null
					? committee.name
					: `${committee.abbreviation} · ${committee.name}`
		}))
	);
</script>

<!--
	Nothing at all when the conference asks for no preferences, because `labels`
	is then empty.

	A label is a plain string with no id of its own, so its place in the list is
	the key, the way `KeyValueList` and `Timeline` key theirs. The index is also
	what numbers the field: the first select is `committee_1`, which is what
	`readApplicationForm` reads it back under.

	Only the first choice is required. `SelectField` does not bind, on purpose:
	`03-design/components.md` explains that it marks the earlier choice with
	`selected` in the HTML itself so that it also shows without JavaScript.
-->
{#each labels as label, index (index)}
	<SelectField
		{label}
		name={`committee_${index + 1}`}
		value={values[index] ?? ''}
		{options}
		error={errors[index] ?? null}
		isRequired={index === 0}
		placeholder="Pick a committee"
	/>
{/each}
