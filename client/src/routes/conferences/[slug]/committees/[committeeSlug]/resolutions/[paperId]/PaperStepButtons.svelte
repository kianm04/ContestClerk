<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { Button } from '$lib/components/ui/button';
	import type { SigningButton } from '$lib/paper-signing';
	import SigningButtonForm from './SigningButtonForm.svelte';

	type Props = {
		/** "Open for signatures", "Sign as Ghana" and the rest, or `null` for nothing to do. */
		signing: SigningButton | null;
		/** Where "Submit to the dais" opens its dialog, or `null` while it is not the next step. */
		submitHref: ResolvedPathname | null;
		/** True while open suggestions keep the paper from being submitted. */
		isSubmitBlocked: boolean;
		/** Where "Withdraw" opens its dialog, for an author of a paper with the dais; or `null`. */
		withdrawHref: ResolvedPathname | null;
		/** "Submit to the dais", or "Send to the crisis staff" for a directive or a press release. */
		submitLabel: string;
		/** Where "Propose an amendment" goes, for a delegate on an introduced draft; or `null`. */
		proposeHref?: ResolvedPathname | null;
	};

	let {
		signing,
		submitHref,
		isSubmitBlocked,
		withdrawHref,
		submitLabel,
		proposeHref = null
	}: Props = $props();
</script>

<!--
	The title row's buttons for the paper's next step, the quiet ones first and
	the one dark-blue button last. Each is a link to a dialog in the address, or
	a plain form, so it works without JavaScript.
-->
{#if withdrawHref}
	<Button href={withdrawHref} variant="outline" size="lg" class="max-lg:h-11">Withdraw</Button>
{/if}
{#if signing}
	<SigningButtonForm button={signing} />
{/if}
{#if submitHref}
	<!-- A link cannot be switched off, so a blocked submit is a disabled button, told why by the count beside it. -->
	{#if isSubmitBlocked}
		<Button size="lg" class="max-lg:h-11" disabled aria-describedby="open-suggestions">
			{submitLabel}
		</Button>
	{:else}
		<Button href={submitHref} size="lg" class="max-lg:h-11">{submitLabel}</Button>
	{/if}
{/if}
{#if proposeHref}
	<Button href={proposeHref} size="lg" class="max-lg:h-11">Propose an amendment</Button>
{/if}
