package main

import (
	"archive/zip"
	"bytes"
	"errors"
	"fmt"
	"image"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) ChooseInvoiceSavePath(outputKind, clientPath, invoiceNumber string) (string, error) {
	if err := a.requireSignedIn(); err != nil {
		return "", err
	}
	outputKind = strings.ToLower(strings.TrimSpace(outputKind))
	if outputKind != "pdf" && outputKind != "docx" {
		return "", errors.New("choose PDF or Microsoft Word")
	}
	props, err := a.GetClientProperties(clientPath)
	if err != nil {
		return "", err
	}
	folder := filepath.Join(a.dataRoot, "Generated Forms", "Invoices")
	if err := os.MkdirAll(folder, 0700); err != nil {
		return "", err
	}
	clientName := engagementSafeFilename(props.Name)
	invoiceSafe := engagementSafeFilename(invoiceNumber)
	if invoiceSafe == "Client" {
		invoiceSafe = "Invoice"
	}
	ext := ".pdf"
	title := "Save PDF Invoice"
	filter := wailsruntime.FileFilter{DisplayName: "PDF Document (*.pdf)", Pattern: "*.pdf"}
	if outputKind == "docx" {
		ext = ".docx"
		title = "Save Microsoft Word Invoice"
		filter = wailsruntime.FileFilter{DisplayName: "Microsoft Word Document (*.docx)", Pattern: "*.docx"}
	}
	defaultName := fmt.Sprintf("Invoice_%s_%s%s", clientName, invoiceSafe, ext)
	chosen, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
		Title:            title,
		DefaultDirectory: folder,
		DefaultFilename:  defaultName,
		Filters:          []wailsruntime.FileFilter{filter},
	})
	if err != nil {
		return "", err
	}
	chosen = strings.TrimSpace(chosen)
	if chosen == "" {
		return "", nil
	}
	if !strings.EqualFold(filepath.Ext(chosen), ext) {
		chosen = strings.TrimSuffix(chosen, filepath.Ext(chosen)) + ext
	}
	return chosen, nil
}

func (a *App) GenerateInvoice(req InvoiceRequest, outputKind string) ([]string, error) {
	if err := a.requireSignedIn(); err != nil {
		return nil, err
	}
	data, err := a.buildInvoiceData(req)
	if err != nil {
		return nil, err
	}
	if data.LogoPath != "" {
		logo, cleanup, err := a.decryptedTemp(data.LogoPath)
		if err != nil {
			return nil, err
		}
		defer cleanup()
		data.LogoPath = logo
	}
	outputKind = strings.ToLower(strings.TrimSpace(outputKind))
	if outputKind != "pdf" && outputKind != "docx" {
		return nil, errors.New("choose PDF or Microsoft Word")
	}
	outputPath := strings.TrimSpace(req.OutputPath)
	if outputPath == "" {
		outputPath, err = a.ChooseInvoiceSavePath(outputKind, data.ClientPath, data.InvoiceNumber)
		if err != nil {
			return nil, err
		}
		if outputPath == "" {
			return nil, nil
		}
	}
	outputPath, err = filepath.Abs(outputPath)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Dir(outputPath), 0700); err != nil {
		return nil, err
	}
	if outputKind == "pdf" {
		if !strings.EqualFold(filepath.Ext(outputPath), ".pdf") {
			outputPath = strings.TrimSuffix(outputPath, filepath.Ext(outputPath)) + ".pdf"
		}
		if err := a.generateOutput(outputPath, func(p string) error { return writeInvoicePDF(p, data) }); err != nil {
			return nil, fmt.Errorf("create invoice PDF: %w", err)
		}
	} else {
		if !strings.EqualFold(filepath.Ext(outputPath), ".docx") {
			outputPath = strings.TrimSuffix(outputPath, filepath.Ext(outputPath)) + ".docx"
		}
		if err := a.generateOutput(outputPath, func(p string) error { return writeInvoiceDOCX(p, data) }); err != nil {
			return nil, fmt.Errorf("create invoice Word document: %w", err)
		}
	}
	detail := fmt.Sprintf("Invoice %s; service %s; tax year %s; %s; total $%.2f; preparer %s; format %s", data.InvoiceNumber, data.Service, data.TaxYear, data.FeeType, data.Total, data.PreparerName, outputKind)
	_ = a.appendAudit(data.ClientPath, "Invoice generated", detail)
	_ = a.appendAppAuditCurrent(data.ClientID, data.ClientName, "Invoice generated", detail)
	_ = a.openGeneratedOutput(outputPath)
	return []string{outputPath}, nil
}

func (a *App) buildInvoiceData(req InvoiceRequest) (invoiceData, error) {
	props, err := a.GetClientProperties(req.ClientPath)
	if err != nil {
		return invoiceData{}, err
	}
	service := strings.TrimSpace(req.Service)
	validService := false
	for _, item := range []string{"1040", "1041", "1065", "1120S", "1120", "Bookkeeping", "Tax Projection"} {
		if service == item {
			validService = true
			break
		}
	}
	if !validService {
		return invoiceData{}, errors.New("select a valid invoice service")
	}
	taxYear := strings.TrimSpace(req.TaxYear)
	yearNumber, yearErr := strconv.Atoi(taxYear)
	if yearErr != nil || yearNumber < 2018 || yearNumber > 2026 {
		return invoiceData{}, errors.New("select a tax year from 2018 through 2026")
	}
	invoiceNumber := strings.TrimSpace(req.InvoiceNumber)
	if invoiceNumber == "" {
		return invoiceData{}, errors.New("enter an invoice number")
	}
	invoiceDate, err := time.Parse("2006-01-02", strings.TrimSpace(req.InvoiceDate))
	if err != nil {
		return invoiceData{}, errors.New("choose a valid invoice date")
	}
	dueDate, err := time.Parse("2006-01-02", strings.TrimSpace(req.DueDate))
	if err != nil {
		return invoiceData{}, errors.New("choose a valid due date")
	}
	if dueDate.Before(invoiceDate) {
		return invoiceData{}, errors.New("the due date cannot be earlier than the invoice date")
	}
	feeType := strings.TrimSpace(req.FeeType)
	if feeType != "Flat Fee" && feeType != "Hourly Rate" {
		return invoiceData{}, errors.New("select Flat Fee or Hourly Rate")
	}
	rate, err := invoiceParseNumber(req.FeeValue)
	if err != nil || rate <= 0 {
		return invoiceData{}, errors.New("enter a valid fee or hourly rate greater than zero")
	}
	hours := 1.0
	if feeType == "Hourly Rate" {
		hours, err = invoiceParseNumber(req.Hours)
		if err != nil || hours <= 0 {
			return invoiceData{}, errors.New("enter valid hours greater than zero")
		}
	}

	users, err := a.ListCompanyUsers()
	if err != nil {
		return invoiceData{}, err
	}
	var preparer *UserProfile
	for i := range users {
		if strings.EqualFold(users[i].Username, strings.TrimSpace(req.PreparerUsername)) {
			copy := users[i]
			preparer = &copy
			break
		}
	}
	if preparer == nil {
		return invoiceData{}, errors.New("select a preparer from the current company")
	}

	companyName := ""
	a.authMu.RLock()
	if a.currentCompany != nil {
		companyName = strings.TrimSpace(a.currentCompany.Name)
	}
	a.authMu.RUnlock()
	if companyName == "" {
		companyName = strings.TrimSpace(preparer.CompanyName)
	}
	preparerName := strings.TrimSpace(preparer.FirstName + " " + preparer.LastName)
	if preparerName == "" {
		preparerName = preparer.Username
	}
	preparerAddress := make([]string, 0, 2)
	if strings.TrimSpace(preparer.StreetAddress) != "" {
		preparerAddress = append(preparerAddress, strings.TrimSpace(preparer.StreetAddress))
	}
	if line := engagementCityStateZIP(*preparer); line != "" {
		preparerAddress = append(preparerAddress, line)
	}
	phone := strings.TrimSpace(preparer.Telephone)
	if phone == "" {
		phone = strings.TrimSpace(preparer.Phone)
	}
	description := strings.TrimSpace(req.Description)
	serviceDesc := engagementServiceDescription(service)
	if description == "" {
		description = fmt.Sprintf("%s - Tax Year %s", serviceDesc, taxYear)
	}
	notes := strings.TrimSpace(req.Notes)
	if notes == "" {
		notes = "Thank you for your business."
	}
	logoPath := a.engagementLetterLogoPath()
	logoWidth, logoHeight := 0, 0
	if logoBytes, openErr := a.secureReadFile(logoPath); openErr == nil {
		if cfg, _, cfgErr := image.DecodeConfig(bytes.NewReader(logoBytes)); cfgErr == nil {
			logoWidth, logoHeight = cfg.Width, cfg.Height
		} else {
			logoPath = ""
		}
	} else {
		logoPath = ""
	}
	total := rate
	if feeType == "Hourly Rate" {
		total = rate * hours
	}
	return invoiceData{
		CompanyName: companyName, ClientID: props.ClientID, ClientName: props.Name, ClientPath: props.Path,
		ClientAddress: props.Address, ClientPhone: props.Phone, ClientEmail: props.Email,
		PreparerName: preparerName, PreparerAddress: preparerAddress, PreparerPhone: phone, PreparerEmail: strings.TrimSpace(preparer.Email),
		Service: service, ServiceDesc: serviceDesc, TaxYear: taxYear, InvoiceNumber: invoiceNumber,
		InvoiceDate: invoiceDate.Format("January 2, 2006"), DueDate: dueDate.Format("January 2, 2006"),
		FeeType: feeType, Rate: rate, Hours: hours, Total: total, Description: description, Notes: notes,
		LogoPath: logoPath, LogoWidth: logoWidth, LogoHeight: logoHeight,
	}, nil
}

func invoiceParseNumber(value string) (float64, error) {
	value = strings.TrimSpace(value)
	value = strings.ReplaceAll(value, "$", "")
	value = strings.ReplaceAll(value, ",", "")
	if value == "" {
		return 0, errors.New("empty number")
	}
	return strconv.ParseFloat(value, 64)
}

func invoiceMoneyText(value float64) string {
	return fmt.Sprintf("$%.2f", value)
}

func writeInvoicePDF(path string, data invoiceData) error {
	const pageWidth = 612.0
	const pageHeight = 792.0
	const left = 54.0
	const right = 54.0
	usable := pageWidth - left - right
	var stream strings.Builder
	y := pageHeight - 54.0
	if data.LogoPath != "" && data.LogoWidth > 0 && data.LogoHeight > 0 {
		logoW := 112.0
		logoH := logoW * float64(data.LogoHeight) / float64(data.LogoWidth)
		if logoH > 58.0 {
			logoH = 58.0
			logoW = logoH * float64(data.LogoWidth) / float64(data.LogoHeight)
		}
		stream.WriteString(fmt.Sprintf("q %.2f 0 0 %.2f %.2f %.2f cm /Im1 Do Q\n", logoW, logoH, left, y-logoH))
		y -= logoH + 8
	}
	write := func(text string, bold bool, size, x float64) {
		font := "F1"
		if bold {
			font = "F2"
		}
		stream.WriteString(fmt.Sprintf("BT /%s %.2f Tf 1 0 0 1 %.2f %.2f Tm (%s) Tj ET\n", font, size, x, y, engagementPDFEscape(text)))
	}
	write(data.CompanyName, true, 14, left)
	invoiceTitle := "INVOICE"
	write(invoiceTitle, true, 24, pageWidth-right-engagementApproxTextWidth(invoiceTitle, 24))
	y -= 18
	write(data.PreparerName, true, 9.5, left)
	y -= 13
	for _, line := range data.PreparerAddress {
		write(line, false, 9, left)
		y -= 12
	}
	for _, line := range []string{data.PreparerPhone, data.PreparerEmail} {
		if strings.TrimSpace(line) != "" {
			write(line, false, 9, left)
			y -= 12
		}
	}
	y -= 8
	stream.WriteString(fmt.Sprintf("%.2f %.2f m %.2f %.2f l S\n", left, y, pageWidth-right, y))
	y -= 22
	write("Invoice #: "+data.InvoiceNumber, true, 10, left)
	write("Invoice Date: "+data.InvoiceDate, false, 9.5, left+250)
	y -= 16
	write("Tax Year: "+data.TaxYear, false, 9.5, left)
	write("Due Date: "+data.DueDate, true, 9.5, left+250)
	y -= 28
	write("BILL TO", true, 9, left)
	y -= 15
	write(data.ClientName, true, 11, left)
	y -= 14
	for _, line := range []string{data.ClientAddress, data.ClientPhone, data.ClientEmail} {
		if strings.TrimSpace(line) != "" {
			for _, wrapped := range engagementWrapText(line, usable*0.72, 9.5) {
				write(wrapped, false, 9.5, left)
				y -= 13
			}
		}
	}
	y -= 18
	stream.WriteString(fmt.Sprintf("%.2f %.2f m %.2f %.2f l S\n", left, y, pageWidth-right, y))
	y -= 18
	write("DESCRIPTION", true, 9, left)
	write("QTY", true, 9, left+310)
	write("RATE", true, 9, left+365)
	write("AMOUNT", true, 9, left+435)
	y -= 14
	stream.WriteString(fmt.Sprintf("%.2f %.2f m %.2f %.2f l S\n", left, y, pageWidth-right, y))
	y -= 19
	descLines := engagementWrapText(data.Description, 290, 9.5)
	lineY := y
	for _, line := range descLines {
		write(line, false, 9.5, left)
		y -= 13
	}
	y = lineY
	qty := "1"
	if data.FeeType == "Hourly Rate" {
		qty = strconv.FormatFloat(data.Hours, 'f', 2, 64)
	}
	write(qty, false, 9.5, left+310)
	write(invoiceMoneyText(data.Rate), false, 9.5, left+365)
	write(invoiceMoneyText(data.Total), true, 9.5, left+435)
	if len(descLines) == 0 {
		y -= 13
	} else {
		y = lineY - float64(len(descLines))*13
	}
	y -= 8
	stream.WriteString(fmt.Sprintf("%.2f %.2f m %.2f %.2f l S\n", left, y, pageWidth-right, y))
	y -= 30
	label := "TOTAL DUE"
	write(label, true, 12, left+330)
	total := invoiceMoneyText(data.Total)
	write(total, true, 14, pageWidth-right-engagementApproxTextWidth(total, 14))
	y -= 40
	if data.Notes != "" {
		write("NOTE", true, 9, left)
		y -= 15
		for _, line := range engagementWrapText(data.Notes, usable, 9.5) {
			write(line, false, 9.5, left)
			y -= 13
		}
	}
	stream.WriteString(fmt.Sprintf("BT /F1 7.5 Tf 1 0 0 1 %.2f 28 Tm (Invoice %s) Tj ET\n", left, engagementPDFEscape(data.InvoiceNumber)))
	return writeSimplePDF(path, []string{stream.String()}, data.CompanyName, "Invoice "+data.InvoiceNumber+" - "+data.ClientName, data.LogoPath, data.LogoWidth, data.LogoHeight)
}

func writeInvoiceDOCX(path string, data invoiceData) error {
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	zw := zip.NewWriter(file)
	closeWithError := func(inner error) error {
		zipErr := zw.Close()
		fileErr := file.Close()
		if inner != nil {
			return inner
		}
		if zipErr != nil {
			return zipErr
		}
		return fileErr
	}
	writeEntry := func(name, body string) error {
		w, err := zw.Create(name)
		if err != nil {
			return err
		}
		_, err = io.WriteString(w, body)
		return err
	}
	var logoBytes []byte
	if data.LogoPath != "" && data.LogoWidth > 0 && data.LogoHeight > 0 {
		logoBytes, _ = os.ReadFile(data.LogoPath)
	}
	hasLogo := len(logoBytes) > 0
	contentTypes := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>`
	if hasLogo {
		contentTypes += `<Default Extension="jpg" ContentType="image/jpeg"/>`
	}
	contentTypes += `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`
	rels := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`
	wordRels := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
	if hasLogo {
		wordRels += `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/firm-logo.jpg"/>`
	}
	wordRels += `</Relationships>`
	styles := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/></w:rPr></w:style></w:styles>`
	core := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>%s</dc:title><dc:creator>%s</dc:creator><cp:lastModifiedBy>BabyFileCab</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">%s</dcterms:created></cp:coreProperties>`, xmlText("Invoice "+data.InvoiceNumber+" - "+data.ClientName), xmlText(data.CompanyName), time.Now().UTC().Format(time.RFC3339))
	app := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>BabyFileCab</Application></Properties>`
	document := invoiceDOCXDocument(data, hasLogo)
	for _, item := range []struct{ name, body string }{
		{"[Content_Types].xml", contentTypes}, {"_rels/.rels", rels}, {"word/document.xml", document},
		{"word/styles.xml", styles}, {"word/_rels/document.xml.rels", wordRels}, {"docProps/core.xml", core}, {"docProps/app.xml", app},
	} {
		if err := writeEntry(item.name, item.body); err != nil {
			return closeWithError(err)
		}
	}
	if hasLogo {
		w, err := zw.Create("word/media/firm-logo.jpg")
		if err != nil {
			return closeWithError(err)
		}
		if _, err := w.Write(logoBytes); err != nil {
			return closeWithError(err)
		}
	}
	return closeWithError(nil)
}

func invoiceDOCXDocument(data invoiceData, hasLogo bool) string {
	var body strings.Builder
	if hasLogo {
		body.WriteString(docxLogoParagraph(data.LogoWidth, data.LogoHeight))
	}
	body.WriteString(docxParagraph(data.CompanyName, true, "left", 28, 20))
	body.WriteString(docxParagraph(data.PreparerName, true, "left", 19, 0))
	for _, line := range data.PreparerAddress {
		body.WriteString(docxParagraph(line, false, "left", 18, 0))
	}
	if data.PreparerPhone != "" {
		body.WriteString(docxParagraph(data.PreparerPhone, false, "left", 18, 0))
	}
	if data.PreparerEmail != "" {
		body.WriteString(docxParagraph(data.PreparerEmail, false, "left", 18, 120))
	}
	body.WriteString(docxParagraph("INVOICE", true, "right", 38, 40))
	body.WriteString(docxParagraph("Invoice #: "+data.InvoiceNumber, true, "right", 20, 0))
	body.WriteString(docxParagraph("Invoice Date: "+data.InvoiceDate, false, "right", 19, 0))
	body.WriteString(docxParagraph("Due Date: "+data.DueDate, true, "right", 19, 160))
	body.WriteString(docxParagraph("BILL TO", true, "left", 18, 40))
	body.WriteString(docxParagraph(data.ClientName, true, "left", 22, 0))
	for _, line := range []string{data.ClientAddress, data.ClientPhone, data.ClientEmail} {
		if strings.TrimSpace(line) != "" {
			body.WriteString(docxParagraph(line, false, "left", 18, 0))
		}
	}
	body.WriteString(docxParagraph("Service", true, "left", 20, 30))
	body.WriteString(docxParagraph(data.Description, false, "left", 20, 0))
	body.WriteString(docxParagraph("Tax Year: "+data.TaxYear, false, "left", 19, 0))
	if data.FeeType == "Hourly Rate" {
		body.WriteString(docxParagraph(fmt.Sprintf("Hours: %.2f", data.Hours), false, "left", 19, 0))
		body.WriteString(docxParagraph("Hourly Rate: "+invoiceMoneyText(data.Rate), false, "left", 19, 80))
	} else {
		body.WriteString(docxParagraph("Flat Fee: "+invoiceMoneyText(data.Rate), false, "left", 19, 80))
	}
	body.WriteString(docxParagraph("TOTAL DUE: "+invoiceMoneyText(data.Total), true, "right", 28, 180))
	if data.Notes != "" {
		body.WriteString(docxParagraph("Note", true, "left", 19, 30))
		body.WriteString(docxParagraph(data.Notes, false, "left", 19, 0))
	}
	body.WriteString(`<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="936" w:right="1123" w:bottom="936" w:left="1123" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`)
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>` + body.String() + `</w:body></w:document>`
}
