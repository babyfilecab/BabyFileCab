# BabyFileCab

BabyFileCab is a document management system for tax preparers, accountants
and small accounting firms. It keeps every client's paperwork organized,
encrypted and on your own computer, with no cloud account or monthly
subscription.

On top of the filing cabinet it has the everyday tools a tax office needs:
a firm calendar, engagement letters, invoices, a time sheet and a quick
federal tax estimator.

**[Download the latest release](https://github.com/babyfilecab/BabyFileCab/releases/latest)** for Windows, macOS or Linux.

## Document management

This is the heart of BabyFileCab.

- **One cabinet per client.** Each client gets a Permanent Folder for
  documents that carry over every year, plus a folder for each tax year. Add
  your own sections inside them (Source Documents, Correspondence, IRS
  Notices, whatever fits how you work).
- **Drag and drop.** Drop files from your desktop straight onto a client,
  year or section. Move documents between folders the same way.
- **Preview without opening.** PDFs, Word, Excel, CSV, email (.eml),
  images and text files show up right in the window. Large PDFs page through
  quickly and you can rotate and zoom.
- **Find anything.** Global Find searches client names, file names,
  descriptions and keywords across the whole firm. Inside a PDF, Ctrl+F
  highlights every match on the page.
- **Track your progress.** Mark documents as Entered / Done and the check
  mark shows in the tree, so you can see at a glance what is left to enter.
- **Client notes and history.** Each client has a formatted notes page and
  an audit trail showing who added, moved, renamed or deleted what, and when.
- **Backups and archiving.** Back up a single client to one encrypted file,
  restore it later, or archive clients you no longer work with without
  deleting anything.

## Security

Client files contain Social Security numbers, bank details and tax returns,
so BabyFileCab encrypts everything it stores.

- Every company has its own AES-256-GCM vault key. Files, notes, client
  profiles and calendar data are encrypted on disk.
- Each user unlocks the vault with their own password (Argon2id). New
  passwords must be at least 12 characters, and a strength meter shows how
  good yours is as you type.
- The app locks itself after 15, 30 or 45 minutes without activity, and
  when the computer sleeps or the screen locks.
- A company-wide audit trail records sign-ins and changes.

See [SECURITY-STATUS.md](SECURITY-STATUS.md) for the full details and the
known limits.

## Other tools

- **Firm Calendar:** schedule clients by day and by preparer, and track each
  return through Drafting, Waiting on Reports, 8879 Sent, Waiting for
  Signature, Signed, Ready to E-file and Completed.
- **Needs Attention:** when you sign in, BabyFileCab lists returns that have
  been stuck waiting for a while or are past their scheduled date, so nothing
  slips through the cracks in the middle of tax season.
- **Engagement Letters and Invoices:** fill in the client, preparer, service
  and fee and get a finished PDF or Word document with your firm's logo.
- **Time Sheet:** log hours worked per client and per day.
- **Federal Tax Calculator:** quick 2025 and 2026 estimates, including the
  Child Tax Credit, self-employment tax and quarterly estimated payments.
- **Currency Converter:** IRS yearly average exchange rates for foreign income.
- **Multiple users:** add Staff and Administrator accounts for everyone in
  your firm. They all share the same client cabinet on that computer.
- Light and dark themes, and keyboard shortcuts you can remap.

## Installing

Download the file for your system from the
[Releases page](https://github.com/babyfilecab/BabyFileCab/releases/latest).

**Windows:** run `BabyFileCab-…-Windows-x64-Setup.exe`. There is also a
portable ZIP if you would rather not install. The app is not code-signed yet,
so Windows SmartScreen may warn you: click *More info* → *Run anyway*.

**macOS:** download the Apple Silicon zip for M1 or newer Macs, or the Intel
zip for older ones. Unzip it and drag BabyFileCab to Applications. Because
the app is not notarized yet, the first time you open it right-click the app
and choose *Open*.

**Linux:** extract the `.tar.gz` and run `./install.sh` inside it. BabyFileCab
then shows up in your applications menu under Office. Run
`./install.sh --uninstall` to remove it. You need WebKitGTK 4.1, which most
current distributions already have. For PDF previews install
`poppler-utils`.

Your data lives in a `BabyFileCabData` folder in your home directory. Back
up that whole folder from time to time, and always before upgrading. The
`.vault-keys` folder inside it is what unlocks your files, so keep it with
the rest of the data.

## Building from source

You need Go 1.25 or newer and [Wails v2](https://wails.io/docs/gettingstarted/installation).
On Linux you also need the GTK 3 and WebKitGTK 4.1 development packages.

```bash
./run.sh                          # development mode with live reload
wails build -tags webkit2_41      # build/bin/BabyFileCab
./build/linux/install.sh          # add it to your Linux app menu
```

Run the tests with:

```bash
go test ./...
for f in frontend/tests/*.test.cjs; do node "$f"; done
```

Pushing a tag such as `v2.1.0` builds and tests the app on Linux, Windows
and macOS through GitHub Actions and attaches the downloads to the release.

## Keyboard shortcuts

Press **F1** in the app for the full manual. The ones I use most:

| Key | Action |
|-----|--------|
| `Ctrl+Shift+F` | Global Find |
| `Ctrl+F` | Find in PDF |
| `F` | Upload files |
| `F2` | Rename document |
| `C` / `Shift+C` | Add / edit client |
| `Y` / `Shift+Y` | Add / edit tax year |
| `S` / `Shift+S` | Add / edit section |
| `D` | Delete (always asks first) |
| `Ctrl+B` | Back up client |
| `F5` | Refresh |

## Project layout

| File | What it does |
|------|--------------|
| `main.go` | Startup, window and auto-lock |
| `auth.go`, `password_*.go`, `accounts_sqlite.go` | Accounts and sign-in |
| `vault.go`, `secure_storage.go`, `vault_backup.go` | Encryption and backups |
| `clients.go`, `tree.go`, `documents.go`, `notes.go` | The document cabinet |
| `preview.go` | Previews and PDF search |
| `calendar*.go`, `timesheet.go` | Firm Calendar and time sheet |
| `invoice.go`, `engagement_letter.go` | Letters and invoices |
| `audit.go`, `audit_sqlite.go` | Audit trail |
| `frontend/dist/` | The interface (plain HTML, CSS and JavaScript) |

## A note on syncing

BabyFileCab is local-first on purpose. Everything stays on the computer it is
installed on, and separate computers do not sync with each other.

Release notes for every version are in [CHANGELOG.md](CHANGELOG.md).
