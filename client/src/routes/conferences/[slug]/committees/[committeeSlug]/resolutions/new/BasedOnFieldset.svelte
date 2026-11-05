<script lang="ts">
	import FormCheckbox from '$lib/components/FormCheckbox.svelte';
	import { Label } from '$lib/components/ui/label';
	import { fieldHelpId, fieldId, labelClasses } from '$lib/form-fields';

	/** One working paper a draft may be based on, and the words beside its box. */
	type BasedOnChoice = { id: string; label: string };

	type Props = {
		/** The committee's introduced working papers, by number. */
		choices: BasedOnChoice[];
		/** The ones ticked so far, as the page was given them. */
		checkedIds: string[];
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { choices, checkedIds }: Props = $props();
</script>

<!--
	"Based on": a box for each introduced working paper, sent as one
	`sourcePaperIds` field for each one ticked. `<fieldset>` with a `<legend>`
	is how HTML groups boxes that answer one question, so a screen reader
	names the group before each box. Each line is 44px tall on a phone.
-->
<fieldset aria-describedby={fieldHelpId('sourcePaperIds')}>
	<legend class={labelClasses(true)}>Based on</legend>
	<ul>
		<!-- The `(choice.id)` key lets Svelte reuse the lines instead of rebuilding them. -->
		{#each choices as choice (choice.id)}
			<li class="flex min-h-11 items-center gap-3 lg:min-h-9">
				<FormCheckbox
					id={fieldId(`sourcePaperIds-${choice.id}`)}
					name="sourcePaperIds"
					value={choice.id}
					isChecked={checkedIds.includes(choice.id)}
				/>
				<Label for={fieldId(`sourcePaperIds-${choice.id}`)} class="cursor-pointer font-normal">
					{choice.label}
				</Label>
			</li>
		{/each}
	</ul>
	<p id={fieldHelpId('sourcePaperIds')} class="mt-1 text-small text-muted-foreground">
		Their text is shown beside yours while you write. Nothing is copied.
	</p>
</fieldset>
