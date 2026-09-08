# Polymath Science Reflection

A build-free, mobile-friendly worksheet app for reflecting on science open-ended question mistakes. Intended address: https://polymathlc.github.io/reflect/.

## Using the app

- Edit Question No., Marks obtained, Total marks, Mistake type and What should I do to improve.
- Customise column headings, types, choices, visibility, order and relative widths. Add, duplicate, move and remove rows. Half marks and question labels such as `3(b)(ii)` are supported.
- Print either a completely blank student sheet or the completed reflection. Choose A4 portrait/landscape, blank row count, writing space and font size. Printed tables repeat their headings on subsequent pages.
- Drafts are retained on this device, separately for each signed-in account. Use **Save online** to sync to Firebase Storage; **My saved sheets** opens saved work. A failed save never reports success.
- Download/open JSON backups without signing in. Backup imports create a new sheet and do not grant access to someone else's scan attachments.
- Sign in, select up to ten photos/PDFs or take a camera photo, then read the handwriting. Each file is processed in order. Review and correct every cell, remove unwanted rows, then add the reviewed rows. Existing completed rows are preserved. Rows continuing across separate image files may need combining manually; the full PDF is supplied together for within-PDF continuation.
- Original scans are saved to Firebase Storage when permitted. If upload fails, transcription still opens for review and the app tells the pupil to keep the original files. Reading is an active browser operation; keep the tab open until the review is ready.

## Shared CER integration

`firebase.js` copies the public Firebase configuration, Google popup sign-in, App Check site key, Firebase 11.10.0 SDK version, Gemini model and authenticated `askOpenAi` fallback from `polymathlc/cer`. No private API key or server credential is committed. The logo URL is extracted from CER's `index.html` and appears in both the app and printed sheets.

The app has no access to another user's sheets through its UI. Actual access control must be enforced by deployed Firebase rules, not by client-side folder names.

Storage layout:

```
reflect/{firebaseAuthUid}/sheets/{sheetId}.json
reflect/{firebaseAuthUid}/scans/{sha256}.{jpg|png|webp|pdf}
```

JSON saves are bounded to 2 MiB. Scans are bounded to 10 MiB per file. Downloads use authenticated `getBytes`, not persistent public download links. The sheet itself contains the column schema, cells, print settings and source paths. No existing CER or Maths records are modified.

## Firebase deployment prerequisite

The shared project's live Storage rules are not present in the CER repo. **Do not deploy the Maths repo's partial rules or replace the live bucket rules from this project.** `docs/storage-reflect.rules` is an additive fragment to merge into the existing `match /b/{bucket}/o` block after inspecting the live rules. Check for overlapping catch-all grants: Firebase allows a request when any matching rule allows it. The fragment alone cannot override a permissive catch-all.

The existing domain `polymathlc.github.io` must remain authorised for Google sign-in and the CER App Check key. Bucket CORS must permit authenticated GET requests from `https://polymathlc.github.io` for `getBytes` downloads. Review existing CORS and merge this origin without replacing other apps' origins.

Live Firebase sign-in, Storage permissions/CORS and handwriting calls require a signed-in deployment check. Repository tests do not prove these live permissions. Until the scoped rules are enabled, online saves/listing/original uploads may be denied; editing, local drafts, backups and printing remain usable.

## Validation and publication

Run `npm run check` and `npm test` with Node 22 or newer. There are no production npm dependencies or build steps. Serve the repository over HTTP for development; ES modules will not load from a `file:` URL.

`ci.yml` runs syntax and data/print/scan regression tests. `pages.yml` packages only the five public application files and publishes the main branch through GitHub Pages. GitHub Pages must be enabled for the repository; the workflow requests enablement and reports any repository permission failure.

Firebase documentation: [image inputs](https://firebase.google.com/docs/ai-logic/analyze-images), [authenticated downloads and CORS](https://firebase.google.com/docs/storage/web/download-files), [Storage security rules](https://firebase.google.com/docs/storage/security).
