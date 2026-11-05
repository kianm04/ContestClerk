<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ResolvedPathname } from '$app/types';
	import ManageDialog from '$lib/components/manage/ManageDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		/** The amendment, as `?withdrawAmendment=` names it. */
		amendment: { id: string; name: string };
		/** The draft's page with this dialog closed, where "Keep it" goes. */
		closeHref: ResolvedPathname;
	};

	let { amendment, closeHref }: Props = $props();

	const inPlace = createInPlaceForm();
</script>

<!--
	The confirmation "Withdraw" on an amendment's card opens, for its
	proposer. The red button is the confirming step; the one that opened this
	dialog was a plain outline. Any amendment to it lapses with it.
-->
<ManageDialog title="Withdraw {amendment.name.toLowerCase()}?" {closeHref}>
	<p class="max-w-md text-body text-foreground">
		It leaves the debate, and any amendment to it lapses.
	</p>

	<form
		method="post"
		action="?/withdrawAmendment"
		use:enhance={inPlace.submit}
		class="flex flex-wrap gap-3 pt-3"
	>
		<input type="hidden" name="amendment" value={amendment.id} />
		<Button
			type="submit"
			variant="destructive"
			size="lg"
			class="max-lg:h-11"
			disabled={inPlace.isBusy}
		>
			Withdraw amendment
		</Button>
		<Button href={closeHref} variant="outline" size="lg" class="max-lg:h-11">Keep it</Button>
	</form>
</ManageDialog>
