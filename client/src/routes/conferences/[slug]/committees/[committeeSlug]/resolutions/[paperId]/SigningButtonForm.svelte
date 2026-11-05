<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { SigningButton } from '$lib/paper-signing';

	type Props = {
		/** What the button does and says, from `signingButton` in `$lib/paper-signing.ts`. */
		button: SigningButton;
	};

	let { button }: Props = $props();
</script>

<!--
	The title row's button for signing: a plain form posting to the page's
	action of the same name, so it works without JavaScript.
-->
<form method="post" action="?/{button.action}">
	<Button
		type="submit"
		variant={button.isPrimary ? 'default' : 'outline'}
		size="lg"
		class="max-lg:h-11"
	>
		{button.label}
	</Button>
</form>
