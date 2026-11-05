<script lang="ts">
	import { PRIVATE_DETAILS_NOTE, ROLE_ACCESS } from '$lib/organiser-close';
</script>

<!--
	Who sees what: each role beside what it can see, on hairlines with no boxes,
	and a note on private details under the list. This is real content, not a
	picture, so screen readers read it.

	It is a description list (`<dl>`): each `<dt>` names a role and the `<dd>`
	after it says what that role sees. The two sit side by side where there is
	room and wrap one under the other on a phone, so no breakpoint is needed.
	Roles have no id, so the `(access.role)` key tells Svelte which row is which.
-->
<dl class="flex flex-col">
	{#each ROLE_ACCESS as access (access.role)}
		<div class="flex flex-wrap gap-x-6 gap-y-0.5 border-t border-line py-3.5 last:border-b">
			<dt class="flex-[0_0_9.5rem] text-body font-semibold text-ink-900">{access.role}</dt>
			<dd class="flex-[1_1_14rem] text-[0.875rem]/[1.375rem] text-ink-600">{access.sees}</dd>
		</div>
	{/each}
</dl>

<p class="mt-4 text-small text-ink-600">{PRIVATE_DETAILS_NOTE}</p>
