<script lang="ts">
	import LegalPage from '$lib/components/LegalPage.svelte';
	import PageMeta from '$lib/components/shell/PageMeta.svelte';
	import { TERMS_LAST_UPDATED, TERMS_SECTIONS } from '$lib/legal-text';
</script>

<!-- `PageMeta` writes the `<title>` and the sharing tags, and adds "· MUNMeet". -->
<PageMeta title="Terms" description="The terms you agree to when you use MUNMeet." />

<!--
	There is no `+page.server.ts` and no `load` here. The words live in
	`$lib/legal-text.ts`, so the page is static markup with nothing to fetch.
-->
<LegalPage title="Terms of service" lastUpdated={TERMS_LAST_UPDATED} sections={TERMS_SECTIONS} />
