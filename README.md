# PowerBuilder 10.5 Docs

Standalone local browser for the converted PowerBuilder 10.5 Help.

## Run

```sh
node server.js
```

Then open:

```text
http://127.0.0.1:8787/
```

Optional port:

```sh
node server.js 8888
```

On Windows, you can also run `start-pbdocs.cmd` or `start-pbdocs.ps1`.

## Deploy

Copy this whole folder to the target machine. It contains:

- `server.js` - Node HTTP server
- `public/` - browser UI
- `data/` - converted Help topics and contents index
- `public/books/pbman/` - extracted HTML Books content

No npm install is required.

Node.js 12 or newer is recommended. If you can choose freely, use the current LTS version.

Do not deploy only `server.js`. The app will not start unless `data/` and `public/` are copied with it.
