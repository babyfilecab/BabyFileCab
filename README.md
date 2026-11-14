# BabyFileCab

A local-first, encrypted document workspace for tax and accounting
professionals, built with Go and [Wails](https://wails.io). Client files,
notes and metadata stay on your computer, encrypted with a per-company vault
key.

## Features

- **Client Work Space:** a Permanent Folder, tax years and custom sections for
  each client, with previews of PDF, Word, Excel, CSV, email, images and text.
- **Search:** Global Find across clients and documents, plus find-in-PDF with
  highlighted matches.
- **Firm Calendar:** schedule clients by day and preparer, track workflow
  statuses (Drafting → 8879 Sent → Signed → Ready to E-file → Completed), and
  get a **Needs attention** list at sign-in for stalled or overdue work.
- **Tools:** engagement letters and invoices (PDF/Word), a federal tax
  estimator (2025/2026), an IRS currency converter and a time sheet.
- **Security:** AES-256-GCM vault, Argon2id password hashing, per-user
  wrapped keys, encrypted audit trail, idle and sleep auto-lock. See
  [SECURITY-STATUS.md](SECURITY-STATUS.md) for details and current limits.
- Light and dark themes, customizable keyboard shortcuts, and multi-user
  companies with Staff and Administrator roles.

## Requirements

- Linux with WebKitGTK 4.1 (tested on Parrot OS), or Windows/macOS
- Go 1.25 or newer. With an older `go`, the default `GOTOOLCHAIN=auto`
  downloads 1.25 automatically on first build.
- [Wails v2](https://wails.io/docs/gettingstarted/installation)
  (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`)
- Optional, for PDF previews and search: `poppler-utils`
  (`pdftoppm`, `pdftotext`, `pdfinfo`)

## Run, build and install

```bash
./run.sh                          # development mode with live reload
wails build -tags webkit2_41      # standalone app: build/bin/BabyFileCab
./build/linux/install.sh          # add BabyFileCab to your app menu
./build/linux/install.sh --uninstall
```

The installer only writes to `~/.local` and never touches your data. Run
`./build/linux/install.sh --rebuild` after pulling changes.

For Windows, `wails build -platform windows/amd64 -nsis` produces an
installer when NSIS is available.

## Tests

```bash
go test ./...
for f in frontend/tests/*.test.cjs; do node "$f"; done
```

## Data location

All data lives in `~/BabyFileCabData`:

| Path | Contents |
|------|----------|
| `companies/<company-id>/` | Company Work Space (encrypted files, `.vault.sqlite`) |
| `.accounts.sqlite` | Account index |
| `.vault-keys/` | Per-user wrapped vault keys. **Back this up together with the data.** |

Back up the whole folder before upgrading. Without the matching
`.vault-keys` files the encrypted data cannot be opened.

## Keyboard shortcuts

Press **F1** in the app for the full manual. The most used:

| Key | Action |
|-----|--------|
| `F1` | User Manual |
| `Ctrl+Shift+F` | Global Find |
| `Ctrl+F` / `M` | Find in PDF |
| `F` / `Shift+F` or `F2` | Upload / rename document |
| `C` / `Shift+C` | Add / edit client |
| `Y` / `Shift+Y` | Add / edit tax year |
| `S` / `Shift+S` | Add / edit section |
| `D` | Delete selected item (with confirmation) |
| `Ctrl+B` | Back up client (Bold in the notes editor) |
| `F5` | Refresh |
| `Ctrl+Shift+L` / `Ctrl+Q` | Sign out / exit |

Shortcuts can be remapped under Settings.

## Project layout

| File | Responsibility |
|------|----------------|
| `main.go` | App startup, lifecycle, auto-lock |
| `types.go` | Shared data types |
| `auth.go`, `password_*.go`, `accounts_sqlite.go` | Accounts, sign-in, password policy |
| `vault.go`, `secure_storage.go`, `vault_backup.go` | Encryption, migration, backups |
| `clients.go`, `tree.go`, `documents.go`, `notes.go` | Work Space |
| `preview.go` | Document previews and PDF search |
| `calendar*.go`, `timesheet.go` | Firm Calendar and time sheet |
| `invoice.go`, `engagement_letter.go` | Document generators |
| `audit.go`, `audit_sqlite.go` | Audit trail |
| `frontend/dist/` | Static HTML/CSS/JS UI (no build step) |
| `build/linux/` | App-menu installer |

## History

Older release notes are in [CHANGELOG.md](CHANGELOG.md).

BabyFileCab is local-first: separate computers do not sync automatically.
