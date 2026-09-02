# Privacy and data flow

CV Builder Web is a static application. There is no application server after GitHub Pages serves the
HTML, JavaScript, CSS, fonts, and fictional examples.

## Data flow

1. The browser downloads static application files from the site's origin.
2. Resume edits remain in the page's memory.
3. `Save draft in browser` stores the current resume in local storage for this origin.
4. Import reads the selected Markdown, JSON, plain-text, or PDF file through browser file APIs.
5. Export creates the requested PDF, Markdown, or JSON file in the browser and passes it to the
   browser's download UI.
6. Finished-PDF inspection extracts text locally and does not upload the selected file.
7. The service worker caches only versioned application assets for offline reloads.

The app does not send resume content in request bodies, query strings, analytics events, logs, or
remote font requests. Links entered into a resume are included in an exported PDF; opening one is a
normal browser navigation to that destination.

## Local deletion and retention

Unsaved edits disappear when the page is discarded. A saved draft remains until the user chooses
`Clear local data`, clears site data in the browser, or the browser evicts storage. Exported files
are controlled by the user's operating system and are not deleted by the app.

## Hosting metadata

GitHub Pages and the user's network may process ordinary request metadata for static asset delivery,
such as IP address, timestamp, browser headers, and requested asset paths. CV Builder Web does not
add analytics or application-level tracking.
