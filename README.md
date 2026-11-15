# BabyFileCab

BabyFileCab is a document management system for tax preparers, accountants
and small accounting firms. It keeps every client's paperwork organized,
encrypted and on your own computer, with no cloud account or monthly
subscription.

On top of the filing cabinet it has the everyday tools a tax office needs:
a firm calendar, engagement letters, invoices, a time sheet and a quick
federal tax estimator.

**[Download the latest release](https://github.com/babyfilecab/BabyFileCab/releases/latest)** for Windows, macOS or Linux.

Website: **[www.babyfilecab.com](https://www.babyfilecab.com)**

## Document management

This is the heart of BabyFileCab.

- **One cabinet per client.** Each client gets a Permanent Folder for
  documents that carry over every year, plus a folder for each tax year. Add
  your own sections inside them (Source Documents, Correspondence, IRS
  Notices, whatever fits how you work).
- **Drag and drop.** Drop files from your desktop straight onto a client,
  year or section. Move documents between folders the same way.
- **Scan inbox.** Point BabyFileCab at the folder your scanner or phone app
  saves to. New scans wait in an Inbox until you file them into a client.
- **Preview without opening.** PDFs, Word, Excel, CSV, email (.eml),
  images and text files show up right in the window, with nothing extra to
  install. Large PDFs page through quickly and you can rotate and zoom.
- **Previous versions.** Upload a file with the same name and the old copy is
  kept as a previous version you can open or restore.
- **Recycle Bin.** Deleted files, tax years and clients can be restored for
  30 days. Only an administrator can delete a client or remove anything for
  good.
- **Find anything.** Global Find searches client names, file names,
  descriptions and keywords across the whole firm. Inside a PDF, Ctrl+F
  highlights every match on the page.
- **Track your progress.** Mark documents as Entered / Done and the check
  mark shows in the tree, so you can see at a glance what is left to enter.
- **Client notes and history.** Each client has a formatted notes page and
  an audit trail showing who added, moved, renamed or deleted what, and when.
- **Backups and archiving.** Automatic daily or weekly backups of everything
  to a drive of your choice, one-client backups, and an Archive for clients
  you no longer work with.

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
- New scans in the scan inbox folder are encrypted within seconds and the
  unencrypted originals removed. Administrators can run an Encryption Check
  to find and encrypt any files copied into the data folder by hand.
- Only one copy of BabyFileCab can use the data folder at a time.
- Settings › Security › Security Plan (WISP) prepares the Written Information Security
  Plan every paid preparer needs, filled in from BabyFileCab's own settings.

See [SECURITY-STATUS.md](SECURITY-STATUS.md) for the full details and the
known limits.

## Other tools

- **Firm Calendar:** schedule clients by day and by preparer, and track each
  return through Drafting, Waiting on Reports, Extension Filed, 8879 Sent,
  Waiting for Signature, Signed, Ready to E-file, E-filed, Accepted or
  Rejected, and Completed. Federal filing deadlines show on the days they
  fall, moved for weekends and holidays the way the IRS moves them. The
  calendar runs from 2025 to two years ahead, and the arrows go straight from
  December into the next January.
- **Needs Attention:** when you sign in, BabyFileCab lists returns that have
  been stuck waiting for a while or are past their scheduled date, so nothing
  slips through the cracks in the middle of tax season.
- **Engagement Letters:** pick the client, preparer, service and fee and get
  a finished PDF or Word letter with your firm's logo, saved in the client's
  folder. Covers individual, amended, trust, partnership, corporate, exempt
  organization, gift, estate and state returns, bookkeeping and projections.
  Administrators can rewrite the wording for the whole firm.
- **Invoices:** as many lines as you need, numbers that run in order
  (INV-2026-0001, 0002…), and hours pulled straight from the Time Sheet. The
  Invoices list shows what's unpaid or overdue and lets you mark payments.
- **Time Sheet:** everyone, staff included, logs their own time per client
  and per day (type 1.5, 1:30 or 90m) and can fix their own entries until
  they're billed, or start a timer and stop it when done. Look at a week,
  month or year with totals per client. Administrators can see everyone's
  time. Export to a spreadsheet; billed hours are marked with the invoice
  number.
- **Federal Tax Calculator:** quick 2024, 2025 and 2026 estimates covering
  itemized or standard deductions, the extra amount for 65+ and blind, the
  2025–2028 senior, tips and overtime deductions, QBI, qualified dividends,
  the Net Investment Income Tax, the Child Tax Credit and credit for other
  dependents, and quarterly payments with the prior-year safe harbor.
- **Currency Converter:** IRS yearly average rates for income, and the
  Treasury's December 31 rates for FBAR and Form 8938 balances.
- **Multiple users:** add Staff and Administrator accounts for everyone in
  your firm. They all share the same client cabinet on that computer.
- Purple (standard), light and dark themes, and keyboard shortcuts you can remap.

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
current distributions already have.

Your data lives in a `BabyFileCabData` folder in your home directory. Turn on
**Settings › Data & Backups › Automatic backups** and point it at an external drive, or back up
that whole folder yourself, and always before upgrading. The
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
| `vault.go`, `secure_storage.go`, `vault_backup.go` | Encryption and client backups |
| `backup_auto.go` | Automatic backups and restore |
| `clients.go`, `tree.go`, `documents.go`, `notes.go` | The document cabinet |
| `recycle.go`, `versions.go`, `inbox.go` | Recycle Bin, previous versions, scan inbox |
| `encryption_check.go`, `wisp.go`, `instance_lock*.go` | Encryption check, security plan, one-copy lock |
| `scripts/make-purple-theme.py` | Builds `css/purple.css` from the light theme; run it after changing colours |
| `preview.go` | Document previews |
| `calendar*.go`, `timesheet*.go` | Firm Calendar and time sheet |
| `invoice*.go`, `engagement_*.go`, `services.go` | Letters, letter wording, invoices and the invoice list |
| `audit.go`, `audit_sqlite.go` | Audit trail |
| `updates.go` | Once-a-day check for a newer release |
| `frontend/dist/js/` | The interface, one file per feature |
| `frontend/dist/js/tax-data.js` | Tax figures and exchange rates (update yearly) |
| `frontend/dist/css/` | `base.css` layout, `theme.css` colors and look |
| `frontend/dist/vendor/pdfjs/` | PDF.js, the built-in PDF viewer |

## A note on syncing

BabyFileCab is local-first on purpose. Everything stays on the computer it is
installed on, and separate computers do not sync with each other. The only
time it goes online is a once-a-day check of this project's public releases
page for a newer version, which you can turn off under Settings.

Release notes for every version are in [CHANGELOG.md](CHANGELOG.md).
