<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import type { InPlaceForm } from '$lib/in-place-form.svelte';

	type Props = {
		/** The page's action it posts to, such as `acceptAmendment`. */
		action: string;
		/** The button's words: "Accept as friendly", "Support". */
		label: string;
		amendmentId: string;
		/** Shared by the card's buttons, so none is pressed twice while one is on its way. */
		inPlace: InPlaceForm;
	};

	let { action, label, amendmentId, inPlace }: Props = $props();
</script>

<!--
	One button on an amendment's card: a plain form naming the amendment, so
	it works without JavaScript. With it, `use:enhance` sends it in the
	background and the page comes back at the card.
-->
<form method="post" action="?/{action}" use:enhance={inPlace.submit}>
	<input type="hidden" name="amendment" value={amendmentId} />
	<Button type="submit" variant="outline" size="sm" class="max-lg:h-11" disabled={inPlace.isBusy}>
		{label}
	</Button>
</form>
