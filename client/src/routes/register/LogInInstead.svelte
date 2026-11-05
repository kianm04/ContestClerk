<script lang="ts">
	import { loginUrl } from '$lib/urls';

	type Props = {
		/** The page the visitor was heading for, which logging in still leads to. */
		next: string;
	};

	let { next }: Props = $props();
</script>

<!--
	The way on for a person who already has an account, drawn under a refused
	sign up and under "Almost done" (`05-pages/auth/register.md`). It keeps
	`next`, so logging in still ends on the page the visitor was heading for.
	`underline` marks it as a link inside a coloured notice.
-->
<p class="mt-1">
	Already have an account?
	<a href={loginUrl(next)} class="font-medium underline">Log in instead</a>
</p>
