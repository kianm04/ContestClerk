// The two things the Trello connector in Claude Code cannot do: download the
// images attached to a card, and attach a new image to a card. Everything else
// (reading a card, commenting, moving it between lists) goes through the
// connector. See .claude/skills/trello-card/SKILL.md for how the two fit together.
//
//   node .claude/scripts/trello.mjs download <card> <directory>
//   node .claude/scripts/trello.mjs attach <card> <file> [name]
//
// <card> is a card URL (https://trello.com/c/oWFN9aQb/...), its short link
// (oWFN9aQb), its id, or the ARI the connector returns.
//
// The key and token come from TRELLO_API_KEY and TRELLO_TOKEN in the
// environment, or else from ~/.config/trello/credentials, a file of the same
// two lines. That file lives outside the repository on purpose: a token must
// never be committed. The token is the long value starting with "ATTA", not the
// "secret" shown next to the key; Trello answers "invalid key" to a secret.

import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const API_ROOT = "https://api.trello.com/1";
const CREDENTIALS_FILE = join(homedir(), ".config", "trello", "credentials");

/** Reads the key and token from the environment, then from the credentials file. */
function readCredentials() {
  const credentials = {
    key: process.env.TRELLO_API_KEY,
    token: process.env.TRELLO_TOKEN,
  };

  if (existsSync(CREDENTIALS_FILE)) {
    for (const line of readFileSync(CREDENTIALS_FILE, "utf8").split("\n")) {
      const [name, ...valueParts] = line.trim().split("=");
      const value = valueParts.join("=").trim();
      if (name === "TRELLO_API_KEY") credentials.key ??= value;
      if (name === "TRELLO_TOKEN") credentials.token ??= value;
    }
  }

  if (!credentials.key || !credentials.token) {
    fail(
      `No Trello key and token. Set TRELLO_API_KEY and TRELLO_TOKEN, or write them to ${CREDENTIALS_FILE}.`,
    );
  }
  return credentials;
}

/**
 * Turns whatever the user or the connector gave for a card into something the
 * REST API accepts. The API takes a short link or an id in the same place.
 */
function cardIdentifier(card) {
  const urlMatch = card.match(/trello\.com\/c\/([A-Za-z0-9]+)/);
  if (urlMatch) return urlMatch[1];

  // An ARI ends in the card's id: ari:cloud:trello::card/workspace/<workspace>/<card>.
  return card.split("/").pop();
}

/** Sends one authenticated request and fails loudly on anything but a 2xx answer. */
async function trelloRequest(url, credentials, options = {}) {
  // Since 2021 Trello only accepts the key and token in this header for
  // attachment downloads, so every request uses it.
  const authorization = `OAuth oauth_consumer_key="${credentials.key}", oauth_token="${credentials.token}"`;
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: authorization, ...options.headers },
  });

  if (!response.ok) {
    fail(
      `Trello answered ${response.status} for ${url}: ${await response.text()}`,
    );
  }
  return response;
}

/**
 * A file name that is safe to put under a directory of ours. Trello sends the
 * name the uploader chose, and anybody on the board can rename an attachment,
 * so it is never trusted as a path: only the last path segment is kept
 * (whichever separator it used), every character outside letters, digits, dot,
 * dash and underscore becomes an underscore, and leading dots go, so neither
 * ".." nor a hidden file can come out of it. An empty result gets a plain name.
 */
export function safeFileName(name) {
  const lastSegment = basename(String(name ?? "").replaceAll("\\", "/"));
  const allowed = lastSegment.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "");
  return allowed === "" ? "attachment" : allowed.slice(0, 120);
}

/**
 * The absolute path for `fileName` inside `directory`, or null when the two
 * resolve to somewhere outside it. `safeFileName` already leaves no separator in
 * the name; this is the check that stands even if that ever changes.
 */
export function pathInside(directory, fileName) {
  const root = resolve(directory);
  const path = resolve(root, fileName);
  return path.startsWith(root + sep) ? path : null;
}

/**
 * The address to download an attachment from, under api.trello.com, or null
 * when it points anywhere but Trello. The download carries the key and token,
 * and the address comes from the card, so it is never trusted to send them
 * elsewhere: only https on trello.com or api.trello.com, on the usual port,
 * with no user name in front of the host (`https://trello.com@evil.example/`
 * is evil.example). The web address under trello.com refuses API credentials;
 * the same path under api.trello.com accepts them.
 */
export function trelloDownloadUrl(address) {
  let url;
  try {
    url = new URL(String(address ?? ""));
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    return null;
  }
  if (url.hostname === "trello.com") url.hostname = "api.trello.com";

  return url.hostname === "api.trello.com" ? url.href : null;
}

/** Downloads every uploaded file on the card into `directory` and prints where each went. */
async function downloadAttachments(card, directory, credentials) {
  const listUrl = `${API_ROOT}/cards/${cardIdentifier(card)}/attachments`;
  const attachments = await (await trelloRequest(listUrl, credentials)).json();

  // Links pasted onto a card are attachments too, but there is nothing to download.
  const uploads = attachments.filter((attachment) => attachment.isUpload);
  if (uploads.length === 0) {
    console.log("This card has no uploaded files.");
    return;
  }

  mkdirSync(directory, { recursive: true });
  for (const [index, attachment] of uploads.entries()) {
    const downloadUrl = trelloDownloadUrl(attachment.url);
    if (downloadUrl === null) {
      fail(
        `Refusing to send the Trello token to ${JSON.stringify(attachment.url)}, which is not on Trello.`,
      );
    }
    const response = await trelloRequest(downloadUrl, credentials);

    // Screenshots pasted into Trello are all called "image.png", so number them
    // in the order they were added to keep them apart. The name is the card's,
    // not ours, hence `safeFileName` and the check that the file lands inside
    // `directory` and nowhere else.
    const fileName = `${index + 1}-${safeFileName(attachment.fileName)}`;
    const path = pathInside(directory, fileName);
    if (path === null) {
      fail(`Refusing to write ${JSON.stringify(attachment.fileName)} outside ${directory}.`);
    }
    writeFileSync(path, Buffer.from(await response.arrayBuffer()));
    console.log(`${path}  (added ${attachment.date})`);
  }
}

/** Uploads `filePath` to the card and prints the new attachment's address. */
async function attachFile(card, filePath, name, credentials) {
  if (!existsSync(filePath)) fail(`No such file: ${filePath}`);

  const form = new FormData();
  form.append("file", new Blob([readFileSync(filePath)]), basename(filePath));
  form.append("name", name ?? basename(filePath));
  // Without this Trello makes every new image the card's cover picture.
  form.append("setCover", "false");

  const uploadUrl = `${API_ROOT}/cards/${cardIdentifier(card)}/attachments`;
  const response = await trelloRequest(uploadUrl, credentials, {
    method: "POST",
    body: form,
  });
  const attachment = await response.json();

  // A comment can show the image with ![name](this address).
  console.log(attachment.url);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

// Only when run as a script, so that the helpers above can be imported and tried
// on their own without the usage message ending the process.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [command, card, ...rest] = process.argv.slice(2);

  if (command === "download" && card && rest[0]) {
    await downloadAttachments(card, rest[0], readCredentials());
  } else if (command === "attach" && card && rest[0]) {
    await attachFile(card, rest[0], rest[1], readCredentials());
  } else {
    fail(
      "Usage:\n  node .claude/scripts/trello.mjs download <card> <directory>\n  node .claude/scripts/trello.mjs attach <card> <file> [name]",
    );
  }
}
