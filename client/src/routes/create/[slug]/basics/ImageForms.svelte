<script lang="ts">
	import { enhance } from '$app/forms';
	import { createInPlaceForm } from '$lib/in-place-form.svelte';

	// One helper for all four forms: each sends in the background and the page
	// shows the new picture without reloading.
	const imageForm = createInPlaceForm();
</script>

<!--
	The forms behind the logo and banner controls. A form may not sit inside
	another, and the controls are drawn inside the step's form, so these are
	empty forms out here that the controls join through their `form` attribute.

	`enctype="multipart/form-data"` is what lets a form carry a file; without it
	the browser would send only the file's name. `use:enhance` sends the form
	in the background once JavaScript has loaded; without it, it posts as usual.
-->
<form
	id="upload-logo"
	method="POST"
	action="?/uploadLogo"
	enctype="multipart/form-data"
	use:enhance={imageForm.submit}
></form>
<form
	id="upload-banner"
	method="POST"
	action="?/uploadBanner"
	enctype="multipart/form-data"
	use:enhance={imageForm.submit}
></form>
<form id="remove-logo" method="POST" action="?/removeLogo" use:enhance={imageForm.submit}></form>
<form
	id="remove-banner"
	method="POST"
	action="?/removeBanner"
	use:enhance={imageForm.submit}
></form>
