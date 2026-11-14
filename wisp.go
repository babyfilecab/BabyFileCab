package main

import (
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// Written Information Security Plan. Every paid preparer needs one (FTC
// Safeguards Rule; IRS Publications 4557 and 5708). BabyFileCab fills in
// everything it already knows about how the firm's client data is protected
// and leaves the rest for the administrator to complete.

// WISPInput is what the administrator adds. It is saved so next year's
// review starts from this year's answers.
type WISPInput struct {
	Coordinator string `json:"coordinator"` // username
	Devices     string `json:"devices"`
	Services    string `json:"services"`
	MFA         string `json:"mfa"`
	Notes       string `json:"notes"`
	LastMade    string `json:"lastMade,omitempty"`
}

type wispData struct {
	Input        WISPInput
	Firm         string
	Date         time.Time
	Coordinator  UserProfile
	Users        []UserProfile
	DataFolder   string
	AutoLock     int
	Backup       BackupSettings
	InboxFolder  string
	FilesChecked int
	Unencrypted  int
}

const wispBlank = "______________________________________________"

func (a *App) GetWISPInput() (WISPInput, error) {
	if err := a.requireAdministrator("prepare the security plan"); err != nil {
		return WISPInput{}, err
	}
	var in WISPInput
	_ = a.metadataJSONGet("settings", "wisp", &in)
	return in, nil
}

func (a *App) gatherWISPData(in WISPInput) (wispData, error) {
	users, err := a.ListCompanyUsers()
	if err != nil {
		return wispData{}, err
	}
	a.authMu.RLock()
	firm := ""
	me := UserProfile{}
	if a.currentCompany != nil {
		firm = a.currentCompany.Name
	}
	if a.currentUser != nil {
		me = *a.currentUser
	}
	autoLock := a.autoLockMinutes
	a.authMu.RUnlock()
	coordinator := me
	for _, u := range users {
		if strings.EqualFold(u.Username, in.Coordinator) {
			coordinator = u
		}
	}
	report, _ := a.findUnencryptedFiles()
	return wispData{
		Input: in, Firm: firm, Date: time.Now(), Coordinator: coordinator, Users: users,
		DataFolder: a.dataRoot, AutoLock: autoLock, Backup: a.loadBackupSettings(),
		InboxFolder: a.inboxFolder(), FilesChecked: report.Checked, Unencrypted: len(report.Unencrypted),
	}, nil
}

func wispPersonName(u UserProfile) string {
	name := strings.TrimSpace(u.FirstName + " " + u.LastName)
	if name == "" {
		name = u.Username
	}
	return name
}

func orBlank(s string) string {
	if s = strings.TrimSpace(s); s == "" {
		return wispBlank
	}
	return s
}

// wispBlocks lays out the plan. Bullets start with "- ".
func wispBlocks(d wispData) []engagementPDFBlock {
	var b []engagementPDFBlock
	h := func(text string) {
		b = append(b, engagementPDFBlock{Text: text, Bold: true, Size: 12, Before: 8, After: 4})
	}
	p := func(text string) { b = append(b, engagementPDFBlock{Text: text, Size: 10, After: 6}) }
	li := func(text string) { b = append(b, engagementPDFBlock{Text: "- " + text, Size: 10, After: 3}) }
	date := d.Date.Format("January 2, 2006")
	review := d.Date.AddDate(1, 0, 0).Format("January 2, 2006")
	coord := wispPersonName(d.Coordinator)

	b = append(b,
		engagementPDFBlock{Text: "Written Information Security Plan", Bold: true, Size: 17, Align: "center", After: 4},
		engagementPDFBlock{Text: d.Firm, Bold: true, Size: 12, Align: "center", After: 2},
		engagementPDFBlock{Text: "Adopted " + date + ". Next review by " + review + ".", Size: 9.5, Align: "center", After: 12},
	)

	h("1. Purpose")
	p(d.Firm + " keeps personal and financial information about its clients. This plan describes how that information is protected, as the FTC Safeguards Rule (16 CFR Part 314) requires of tax and accounting firms, following IRS Publication 4557 (Safeguarding Taxpayer Data) and Publication 5708. It covers client information in every form: paper, electronic files, and information held by outside services.")

	h("2. Data Security Coordinator")
	contact := strings.Join(nonEmpty(d.Coordinator.Email, firstNonEmpty(d.Coordinator.Telephone, d.Coordinator.Phone)), ", ")
	if contact != "" {
		contact = " Contact: " + contact + "."
	}
	p(coord + " is the firm's Data Security Coordinator (the \"Qualified Individual\" under the Safeguards Rule), responsible for putting this plan in place, training everyone on it, checking that the safeguards work, and leading the response to any incident." + contact)

	h("3. Client information and where it is kept")
	li("Client documents, notes, profiles, invoices, engagement letters, time records and the firm calendar are kept in BabyFileCab on the firm's computer, in " + d.DataFolder + ".")
	if d.InboxFolder != "" {
		li("Scans saved to " + d.InboxFolder + " are moved into BabyFileCab's encrypted storage within seconds while BabyFileCab is open, and the unencrypted original is deleted.")
	}
	li("Computers and devices used for client work: " + orBlank(d.Input.Devices))
	li("Other software and outside services that hold client information (tax software, email, e-signature, client portal, cloud storage, payroll): " + orBlank(d.Input.Services))
	li("Paper records: " + wispBlank)

	h("4. Risk assessment")
	p("The main risks to client information, and the safeguards in section 5 that address them:")
	li("Theft or loss of a computer, phone or backup drive: encryption, automatic sign-out, backups.")
	li("Phishing emails and stolen passwords: training, strong passwords, multi-factor authentication.")
	li("Ransomware and other malware: backups kept off the computer, updates, security software.")
	li("Access by people who no longer need it: individual accounts, removed the day someone leaves.")
	li("Accidental deletion or sending information to the wrong person: Recycle Bin, staff limits, care when sending.")
	li("Improper disposal of old records and equipment: record-keeping review, shredding, wiping drives.")
	p("The coordinator reviews these risks at least once a year and whenever the firm's systems, services or staff change.")

	h("5. Safeguards")
	p("Access. Everyone signs in to BabyFileCab with their own account; accounts are never shared. Current accounts:")
	for _, u := range d.Users {
		li(wispPersonName(u) + " (@" + u.Username + "), " + displayAuditRole(u.Role))
	}
	p("Staff accounts cannot permanently delete clients or empty the Recycle Bin. When someone leaves the firm, their account is removed and their passwords for other services are changed the same day.")
	p("Passwords. BabyFileCab passwords must be at least 12 characters, cannot be common passwords and cannot contain the username. Passwords are never written down where others can see them or shared.")
	p("Multi-factor authentication. The Safeguards Rule requires multi-factor authentication for anyone accessing client information. BabyFileCab itself signs in with a password, so describe here how it is used for the computer, email, tax software and other services: " + orBlank(d.Input.MFA))
	enc := "Encryption. Everything BabyFileCab stores is encrypted with AES-256-GCM. The encryption key is protected by each user's password (Argon2id) and is never stored unprotected. Documents are decrypted only while someone is viewing them. Folder and file names, such as client names, are not encrypted."
	if d.FilesChecked > 0 {
		if d.Unencrypted == 0 {
			enc += fmt.Sprintf(" On %s all %d files in the data folder were confirmed encrypted.", date, d.FilesChecked)
		} else {
			enc += fmt.Sprintf(" On %s, %d of %d files in the data folder were not encrypted; they are to be encrypted with Settings > Security > Encryption check.", date, d.Unencrypted, d.FilesChecked)
		}
	}
	p(enc)
	p(fmt.Sprintf("Automatic sign-out. BabyFileCab signs out after %d minutes without activity. Computers lock their screens when unattended.", d.AutoLock))
	switch d.Backup.Frequency {
	case "daily", "weekly":
		text := fmt.Sprintf("Backups. BabyFileCab makes a %s backup to %s and keeps the last %d. Backups hold the same encrypted files, so they can only be read with a firm password.", d.Backup.Frequency, d.Backup.Folder, d.Backup.Keep)
		if d.Backup.LastOK != "" {
			if t, err := time.Parse(time.RFC3339, d.Backup.LastOK); err == nil {
				text += " Last successful backup: " + t.Format("January 2, 2006") + "."
			}
		}
		p(text + " A backup is restored as a test at least once a year.")
	default:
		p("Backups. Automatic backups are not turned on in BabyFileCab (Settings > Data & Backups). Describe how backups are made: " + wispBlank)
	}
	p("Record keeping and disposal. Client tax records are kept for " + wispBlank + " years after filing (at least three, as the IRS requires of preparers), then deleted. Deleted items stay in BabyFileCab's Recycle Bin for 30 days and are then removed for good. Paper is shredded. Computers, phones and drives are wiped or destroyed before they are sold, recycled or thrown away. Under the Safeguards Rule, client information is disposed of no later than two years after it was last used for the client unless the firm needs it for business or legal reasons, such as the record-keeping period above.")
	p("Monitoring. BabyFileCab records activity such as sign-ins, documents added, opened, changed and deleted, exports and settings changes in its Audit Trail (Settings > Security > Audit trail). The coordinator looks it over regularly for anything unusual.")
	p("Updates and security software. Operating systems, BabyFileCab, tax software and browsers are kept up to date. Computers run security software and a firewall.")
	p("Training. Everyone with access to client information is trained on this plan when they start and at least once a year, including how to recognize phishing.")
	p("Outside services. The firm uses only services that protect client information, checks how they do so before using them, and reviews them at least once a year.")
	p("Sending information. Client information is sent only by secure means such as a client portal or encrypted file, never in a plain email attachment.")

	h("6. If something goes wrong")
	p("If client information may have been stolen, lost or seen by someone who shouldn't have it, or a computer is behaving strangely:")
	li("Disconnect the affected computer from the network, but don't turn it off or delete anything.")
	li("Tell the Data Security Coordinator right away.")
	li("Contact the local IRS Stakeholder Liaison (listed on irs.gov under \"Stakeholder Liaison local contacts\") to report the data theft.")
	li("Email the Federation of Tax Administrators at StateAlert@taxadmin.org for how to report to each state where the firm files returns.")
	li("Report theft or computer crime to local police, and the FBI where appropriate.")
	li("If the information of 500 or more people was acquired without permission, notify the FTC as soon as possible and no later than 30 days after discovering it.")
	li("Notify affected clients as required by state law, and change any passwords that may have been exposed.")
	li("Afterwards, write down what happened and what was changed to stop it happening again.")
	p("Stakeholder Liaison contact: " + wispBlank)

	h("7. Review")
	p("The coordinator reviews this plan at least once a year and whenever the firm's systems, services or staff change, and gives the owner a written report on the plan, the risks, any incidents and any changes recommended.")
	if notes := strings.TrimSpace(d.Input.Notes); notes != "" {
		h("8. Other notes")
		p(notes)
	}

	b = append(b,
		engagementPDFBlock{Text: "Data Security Coordinator: " + coord, Bold: true, Size: 10, Before: 16, After: 16},
		engagementPDFBlock{Text: "Signature: ____________________________________    Date: ________________", Size: 10, After: 18},
		engagementPDFBlock{Text: "Owner: ____________________________________", Bold: true, Size: 10, After: 16},
		engagementPDFBlock{Text: "Signature: ____________________________________    Date: ________________", Size: 10, After: 14},
		engagementPDFBlock{Text: "Started with BabyFileCab from the firm's own settings. Read it through and change anything that doesn't match how the firm works.", Size: 8.5, Before: 6},
	)
	return b
}

func nonEmpty(values ...string) []string {
	out := []string{}
	for _, v := range values {
		if v = strings.TrimSpace(v); v != "" {
			out = append(out, v)
		}
	}
	return out
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v = strings.TrimSpace(v); v != "" {
			return v
		}
	}
	return ""
}

func writeWISPPDF(path string, d wispData) error {
	blocks := wispBlocks(d)
	const pageWidth, pageHeight, left, right, top, bottom = 612.0, 792.0, 60.0, 60.0, 56.0, 52.0
	usable := pageWidth - left - right
	pages := []*strings.Builder{{}}
	y := pageHeight - top
	for _, block := range blocks {
		y -= block.Before
		indent := 0.0
		text := block.Text
		if strings.HasPrefix(text, "- ") {
			indent = 12
		}
		lines := engagementWrapText(text, usable-indent, block.Size)
		for i, line := range lines {
			leading := block.Size * 1.34
			if y-leading < bottom {
				pages = append(pages, &strings.Builder{})
				y = pageHeight - top
			}
			x := left
			if i > 0 {
				x += indent
			}
			if w := engagementApproxTextWidth(line, block.Size); block.Align == "center" {
				x = left + (usable-w)/2
			}
			font := "F1"
			if block.Bold {
				font = "F2"
			}
			fmt.Fprintf(pages[len(pages)-1], "BT /%s %.2f Tf 1 0 0 1 %.2f %.2f Tm (%s) Tj ET\n", font, block.Size, x, y, engagementPDFEscape(line))
			y -= leading
		}
		y -= block.After
	}
	streams := make([]string, len(pages))
	for i, pg := range pages {
		footer := fmt.Sprintf("Page %d of %d", i+1, len(pages))
		fmt.Fprintf(pg, "BT /F1 7.5 Tf 1 0 0 1 %.2f 28 Tm (%s) Tj ET\n", left, engagementPDFEscape(d.Firm+" - Written Information Security Plan"))
		fmt.Fprintf(pg, "BT /F1 7.5 Tf 1 0 0 1 %.2f 28 Tm (%s) Tj ET\n", pageWidth-right-engagementApproxTextWidth(footer, 7.5), footer)
		streams[i] = pg.String()
	}
	return writeSimplePDF(path, streams, d.Firm, "Written Information Security Plan", "", 0, 0)
}

func writeWISPDOCX(path string, d wispData) error {
	var body strings.Builder
	for _, block := range wispBlocks(d) {
		size := int(block.Size*2 + 0.5)
		after := int(block.After * 20)
		if block.Before > 0 {
			body.WriteString(fmt.Sprintf(`<w:p><w:pPr><w:spacing w:after="%d"/></w:pPr></w:p>`, int(block.Before*10)))
		}
		if strings.HasPrefix(block.Text, "- ") {
			body.WriteString(fmt.Sprintf(`<w:p><w:pPr><w:ind w:left="360" w:hanging="220"/><w:spacing w:after="%d"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="%d"/></w:rPr><w:t xml:space="preserve">%s</w:t></w:r></w:p>`, after, size, xmlText("• "+strings.TrimPrefix(block.Text, "- "))))
			continue
		}
		body.WriteString(docxParagraph(block.Text, block.Bold, block.Align, size, after))
	}
	body.WriteString(`<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1200" w:bottom="1000" w:left="1200" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`)
	document := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>` + body.String() + `</w:body></w:document>`
	return writeDOCXPackage(path, "Written Information Security Plan", d.Firm, document, nil)
}

// GenerateWISP saves the answers, asks where to save the plan and opens it.
func (a *App) GenerateWISP(in WISPInput, format string) (string, error) {
	if err := a.requireAdministrator("prepare the security plan"); err != nil {
		return "", err
	}
	if format != "pdf" && format != "docx" {
		return "", errors.New("choose PDF or Word")
	}
	for _, f := range []*string{&in.Devices, &in.Services, &in.MFA, &in.Notes} {
		*f = strings.TrimSpace(*f)
		if len([]rune(*f)) > 2000 {
			return "", errors.New("each answer must be 2,000 characters or less")
		}
	}
	data, err := a.gatherWISPData(in)
	if err != nil {
		return "", err
	}
	if a.ctx == nil {
		return "", errors.New("application is not ready")
	}
	ext := "." + format
	path, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
		Title:           "Save the security plan",
		DefaultFilename: fmt.Sprintf("Written Information Security Plan %d%s", data.Date.Year(), ext),
		Filters:         []wailsruntime.FileFilter{{DisplayName: strings.ToUpper(format), Pattern: "*" + ext}},
	})
	if err != nil || path == "" {
		return "", err
	}
	if !strings.EqualFold(filepath.Ext(path), ext) {
		path += ext
	}
	write := func(p string) error { return writeWISPPDF(p, data) }
	if format == "docx" {
		write = func(p string) error { return writeWISPDOCX(p, data) }
	}
	if err := a.generateOutput(path, write); err != nil {
		return "", err
	}
	in.LastMade = data.Date.Format("2006-01-02")
	_ = a.metadataJSONPut("settings", "wisp", in)
	_ = a.appendAppAuditCurrent("", "", "Security plan prepared", filepath.Base(path))
	_ = a.openGeneratedOutput(path)
	return path, nil
}
