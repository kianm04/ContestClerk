// The helpers trello.mjs keeps a card's attachments in their place with:
// finding L79 of the security review of 10 October 2026. Run by
// `pnpm test:scripts` in client/.

import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { pathInside, safeFileName, trelloDownloadUrl } from "./trello.mjs";

test("safeFileName keeps the last segment, in letters, digits, dot, dash and underscore", () => {
  assert.equal(safeFileName("image.png"), "image.png");
  assert.equal(safeFileName("../../.ssh/authorized_keys"), "authorized_keys");
  assert.equal(safeFileName("..\\..\\evil.png"), "evil.png");
  assert.equal(safeFileName("my picture (1).png"), "my_picture__1_.png");
});

test("safeFileName leaves no hidden file, no dot-dot and no empty name", () => {
  assert.equal(safeFileName(".bashrc"), "bashrc");
  assert.equal(safeFileName(".."), "attachment");
  assert.equal(safeFileName(""), "attachment");
  assert.equal(safeFileName(undefined), "attachment");
  assert.equal(safeFileName("a".repeat(300)).length, 120);
});

test("pathInside answers a path inside the directory, and null for one that leaves it", () => {
  const directory = resolve("downloads");
  assert.equal(
    pathInside(directory, "1-image.png"),
    join(directory, "1-image.png"),
  );
  assert.equal(pathInside(directory, "../outside.png"), null);
  assert.equal(pathInside(directory, "/etc/passwd"), null);
  assert.equal(pathInside(directory, ""), null);
});

test("trelloDownloadUrl moves a trello.com address to api.trello.com", () => {
  assert.equal(
    trelloDownloadUrl(
      "https://trello.com/1/cards/abc/attachments/def/download/image.png",
    ),
    "https://api.trello.com/1/cards/abc/attachments/def/download/image.png",
  );
  assert.equal(
    trelloDownloadUrl(
      "https://api.trello.com/1/cards/abc/attachments/def/download/image.png",
    ),
    "https://api.trello.com/1/cards/abc/attachments/def/download/image.png",
  );
});

test("trelloDownloadUrl refuses every address that would carry the token off Trello", () => {
  assert.equal(trelloDownloadUrl("https://evil.example/image.png"), null);
  assert.equal(
    trelloDownloadUrl("https://trello.com.evil.example/image.png"),
    null,
  );
  assert.equal(
    trelloDownloadUrl("https://trello.com@evil.example/image.png"),
    null,
  );
  assert.equal(trelloDownloadUrl("http://trello.com/1/cards/abc"), null);
  assert.equal(
    trelloDownloadUrl("https://api.trello.com:8443/1/cards/abc"),
    null,
  );
  assert.equal(trelloDownloadUrl("not an address"), null);
  assert.equal(trelloDownloadUrl(undefined), null);
});
