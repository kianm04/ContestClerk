<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ResolvedPathname } from '$app/types';
	import ManageDialog from '$lib/components/manage/ManageDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		/** The amendment being ruled out: its id, and "Amendment 3". */
		amendment: { id: string; name: string };
		/** The longest ruling the database takes. */
		maxLength: number;
		/** The page with this dialog closed, where "Cancel" goes. */
		closeHref: ResolvedPathname;
	};

	let { amendment, maxLength, closeHref }: Props = $props();

	const inPlace = createInPlaceForm();
	// `$props.id()` gives this component an id unique on the page, for the label's `for`.
	const uid = $props.id();
</script>

<!--
	"Rule out of order", opened from the address (`?ruleOut=3`), so without
	JavaScript it is drawn on the page with its form. The proposer reads the
	ruling on the amendment's card.
-->
<ManageDialog title="Rule {amendment.name.toLowerCase()} out of order?" {closeHref}>
	<form
		method="post"
		action="?/ruleOutAmendment"
		use:enhance={inPlace.submit}
		class="flex flex-col gap-4"
	>
		<input type="hidden" name="amendment" value={amendment.id} />
		<div class="flex flex-col gap-1.5">
			<label for="{uid}-ruling" class="text-label text-foreground">Why it is out of order</label>
			<Textarea
				id="{uid}-ruling"
				name="ruling"
				rows={4}
				required
				maxlength={maxLength}
				readonly={inPlace.isBusy}
			/>
			<p class="text-small text-muted-foreground">The proposer reads this on the amendment.</p>
		</div>
		<div class="flex flex-wrap gap-3">
			<Button type="submit" size="lg" class="max-lg:h-11" disabled={inPlace.isBusy}>
				Rule out of order
			</Button>
			<Button href={closeHref} variant="outline" size="lg" class="max-lg:h-11">Cancel</Button>
		</div>
	</form>
</ManageDialog>
