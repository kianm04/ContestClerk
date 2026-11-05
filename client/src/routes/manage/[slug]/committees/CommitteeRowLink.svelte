<script lang="ts">
	import type { ResolvedPathname } from '$app/types';

	type Props = {
		/** Built with a helper from `$lib/urls.ts`. */
		href: ResolvedPathname;
		/** The words on the link, such as "Edit". */
		label: string;
		/**
		 * The link's full name for a screen reader, such as "Edit Human Rights
		 * Council". Every row has an "Edit", and a list of links read out on
		 * their own would otherwise be "Edit, Edit, Edit". It contains
		 * `label`, so somebody who says the words they see still reaches it.
		 */
		accessibleName: string;
	};

	// `$props()` is how a Svelte component receives what its parent passes in.
	let { href, label, accessibleName }: Props = $props();
</script>

<!-- 44px tall on a phone, so a finger can hit it; from `xl` up, inside the table, as tall as its words. -->
<a
	{href}
	aria-label={accessibleName}
	class="inline-flex min-h-11 items-center font-medium text-link hover:underline xl:min-h-0"
>
	{label}
</a>
