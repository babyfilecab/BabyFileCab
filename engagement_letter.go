package main

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"html"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) engagementLetterLogoPath() string {
	return filepath.Join(a.dataRoot, engagementLogoFile)
}

func (a *App) GetEngagementLetterLogo() (EngagementLetterLogoInfo, error) {
	if err := a.requireSignedIn(); err != nil {
		return EngagementLetterLogoInfo{}, err
	}
	path := a.engagementLetterLogoPath()
	data, err := a.secureReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return EngagementLetterLogoInfo{}, nil
	}
	if err != nil {
		return EngagementLetterLogoInfo{}, err
	}
	return EngagementLetterLogoInfo{
		Path:    path,
		DataURL: "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(data),
	}, nil
}

func (a *App) ChooseEngagementLetterLogo() (EngagementLetterLogoInfo, error) {
	if err := a.requireSignedIn(); err != nil {
		return EngagementLetterLogoInfo{}, err
	}
	chosen, err := wailsruntime.OpenFileDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title: "Choose Firm Logo",
		Filters: []wailsruntime.FileFilter{
			{DisplayName: "Image Files (*.png;*.jpg;*.jpeg)", Pattern: "*.png;*.jpg;*.jpeg"},
		},
	})
	if err != nil {
		return EngagementLetterLogoInfo{}, err
	}
	if strings.TrimSpace(chosen) == "" {
		return a.GetEngagementLetterLogo()
	}
	info, err := os.Stat(chosen)
	if err != nil {
		return EngagementLetterLogoInfo{}, err
	}
	if info.Size() > 10*1024*1024 {
		return EngagementLetterLogoInfo{}, errors.New("firm logo must be 10 MB or smaller")
	}
	file, err := os.Open(chosen)
	if err != nil {
		return EngagementLetterLogoInfo{}, err
	}
	img, _, decodeErr := image.Decode(file)
	_ = file.Close()
	if decodeErr != nil {
		return EngagementLetterLogoInfo{}, errors.New("choose a valid PNG or JPEG logo")
	}
	bounds := img.Bounds()
	if bounds.Dx() < 1 || bounds.Dy() < 1 || bounds.Dx() > 10000 || bounds.Dy() > 10000 {
		return EngagementLetterLogoInfo{}, errors.New("firm logo dimensions are not supported")
	}
	// Normalize all logos to JPEG so PDF and Word generation can embed one
	// predictable image format. Transparent PNG areas are placed on white.
	canvas := image.NewRGBA(image.Rect(0, 0, bounds.Dx(), bounds.Dy()))
	draw.Draw(canvas, canvas.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
	draw.Draw(canvas, canvas.Bounds(), img, bounds.Min, draw.Over)

	path := a.engagementLetterLogoPath()
	var logoBytes bytes.Buffer
	if err := jpeg.Encode(&logoBytes, canvas, &jpeg.Options{Quality: 92}); err != nil {
		return EngagementLetterLogoInfo{}, err
	}
	if err := a.secureWriteFile(path, logoBytes.Bytes()); err != nil {
		return EngagementLetterLogoInfo{}, err
	}
	_ = a.appendAppAuditCurrent("", "", "Engagement Letter logo updated", "Firm logo saved for the current company account")
	return a.GetEngagementLetterLogo()
}

func (a *App) ClearEngagementLetterLogo() error {
	if err := a.requireSignedIn(); err != nil {
		return err
	}
	path := a.engagementLetterLogoPath()
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	_ = a.appendAppAuditCurrent("", "", "Engagement Letter logo removed", "Firm logo removed for the current company account")
	return nil
}

func (a *App) EngagementLetterDefaultOutput(clientPath, service, taxYear string) (string, error) {
	if err := a.requireSignedIn(); err != nil {
		return "", err
	}
	props, err := a.GetClientProperties(clientPath)
	if err != nil {
		return "", err
	}
	folder := filepath.Join(a.dataRoot, "Generated Forms", "Engagement Letters")
	if err := os.MkdirAll(folder, 0700); err != nil {
		return "", err
	}
	name := engagementSafeFilename(props.Name)
	service = engagementSafeFilename(service)
	taxYear = engagementSafeFilename(taxYear)
	if service == "" {
		service = "Service"
	}
	if taxYear == "" {
		taxYear = "Year"
	}
	return filepath.Join(folder, fmt.Sprintf("Engagement_Letter_%s_%s_%s.pdf", name, service, taxYear)), nil
}

func (a *App) ChooseEngagementLetterSavePath(outputKind, clientPath, service, taxYear string) (string, error) {
	if err := a.requireSignedIn(); err != nil {
		return "", err
	}
	outputKind = strings.ToLower(strings.TrimSpace(outputKind))
	if outputKind != "pdf" && outputKind != "docx" {
		return "", errors.New("choose PDF or Microsoft Word")
	}
	defaultPDF, err := a.EngagementLetterDefaultOutput(clientPath, service, taxYear)
	if err != nil {
		return "", err
	}
	stem := strings.TrimSuffix(defaultPDF, filepath.Ext(defaultPDF))
	ext := ".pdf"
	title := "Save PDF Engagement Letter"
	filter := wailsruntime.FileFilter{DisplayName: "PDF Document (*.pdf)", Pattern: "*.pdf"}
	if outputKind == "docx" {
		ext = ".docx"
		title = "Save Microsoft Word Engagement Letter"
		filter = wailsruntime.FileFilter{DisplayName: "Microsoft Word Document (*.docx)", Pattern: "*.docx"}
	}
	chosen, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
		Title:           title,
		DefaultFilename: filepath.Base(stem + ext),
		Filters:         []wailsruntime.FileFilter{filter},
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

func (a *App) ChooseEngagementLetterOutput(suggestedPath string) (string, error) {
	if err := a.requireSignedIn(); err != nil {
		return "", err
	}
	defaultName := filepath.Base(strings.TrimSpace(suggestedPath))
	if defaultName == "." || defaultName == "" {
		defaultName = "Engagement_Letter.pdf"
	}
	if !strings.EqualFold(filepath.Ext(defaultName), ".pdf") {
		defaultName = strings.TrimSuffix(defaultName, filepath.Ext(defaultName)) + ".pdf"
	}
	chosen, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
		Title:           "Save Engagement Letter",
		DefaultFilename: defaultName,
		Filters:         []wailsruntime.FileFilter{{DisplayName: "PDF Document (*.pdf)", Pattern: "*.pdf"}},
	})
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(chosen) == "" {
		return "", nil
	}
	if !strings.EqualFold(filepath.Ext(chosen), ".pdf") {
		chosen += ".pdf"
	}
	return chosen, nil
}

func (a *App) GenerateEngagementLetter(req EngagementLetterRequest, outputKind string) ([]string, error) {
	if err := a.requireSignedIn(); err != nil {
		return nil, err
	}
	data, err := a.buildEngagementLetterData(req)
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
	if outputKind != "pdf" && outputKind != "docx" && outputKind != "both" {
		return nil, errors.New("choose PDF, Word, or Both")
	}

	basePath := strings.TrimSpace(req.OutputPath)
	if basePath == "" {
		basePath, err = a.EngagementLetterDefaultOutput(data.ClientPath, data.Service, data.TaxYear)
		if err != nil {
			return nil, err
		}
	}
	basePath, err = filepath.Abs(basePath)
	if err != nil {
		return nil, err
	}
	stem := strings.TrimSuffix(basePath, filepath.Ext(basePath))
	pdfPath := stem + ".pdf"
	docxPath := stem + ".docx"
	if err := os.MkdirAll(filepath.Dir(basePath), 0700); err != nil {
		return nil, err
	}

	generated := make([]string, 0, 2)
	if outputKind == "pdf" || outputKind == "both" {
		if err := a.generateOutput(pdfPath, func(p string) error { return writeEngagementLetterPDF(p, data) }); err != nil {
			return nil, fmt.Errorf("create engagement-letter PDF: %w", err)
		}
		generated = append(generated, pdfPath)
	}
	if outputKind == "docx" || outputKind == "both" {
		if err := a.generateOutput(docxPath, func(p string) error { return writeEngagementLetterDOCX(p, data) }); err != nil {
			return nil, fmt.Errorf("create engagement-letter Word document: %w", err)
		}
		generated = append(generated, docxPath)
	}

	detail := fmt.Sprintf("Service %s; tax year/period %s; %s %s; preparer %s; formats %s", data.Service, data.TaxYear, data.FeeType, data.FeeValue, data.PreparerName, outputKind)
	_ = a.appendAudit(data.ClientPath, "Engagement letter generated", detail)
	_ = a.appendAppAuditCurrent(data.ClientID, data.ClientName, "Engagement Letter generated", detail)
	for _, path := range generated {
		_ = a.openGeneratedOutput(path)
	}
	return generated, nil
}

func (a *App) buildEngagementLetterData(req EngagementLetterRequest) (engagementLetterData, error) {
	props, err := a.GetClientProperties(req.ClientPath)
	if err != nil {
		return engagementLetterData{}, err
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
		return engagementLetterData{}, errors.New("select a valid Engagement Letter service")
	}
	taxYear := strings.TrimSpace(req.TaxYear)
	yearNumber, yearErr := strconv.Atoi(taxYear)
	if latest := latestTaxYear(time.Now()); yearErr != nil || yearNumber < 2018 || yearNumber > latest {
		return engagementLetterData{}, fmt.Errorf("select a tax year from 2018 through %d", latest)
	}
	feeType := strings.TrimSpace(req.FeeType)
	if feeType != "Flat Fee" && feeType != "Hourly Rate" {
		return engagementLetterData{}, errors.New("select Flat Fee or Hourly Rate")
	}
	feeValue := engagementFormatFee(feeType, req.FeeValue)
	if feeValue == "" {
		return engagementLetterData{}, errors.New("enter the flat fee or hourly rate")
	}

	users, err := a.ListCompanyUsers()
	if err != nil {
		return engagementLetterData{}, err
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
		return engagementLetterData{}, errors.New("select a preparer from the current company")
	}

	// The engagement letter always uses the company account that is currently
	// signed into BabyFileCab. The preparer profile is used for the preparer's
	// personal/contact information, not to override the active firm name.
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
	cityStateZIP := engagementCityStateZIP(*preparer)
	preparerAddress := make([]string, 0, 2)
	if strings.TrimSpace(preparer.StreetAddress) != "" {
		preparerAddress = append(preparerAddress, strings.TrimSpace(preparer.StreetAddress))
	}
	if cityStateZIP != "" {
		preparerAddress = append(preparerAddress, cityStateZIP)
	}
	phone := strings.TrimSpace(preparer.Telephone)
	if phone == "" {
		phone = strings.TrimSpace(preparer.Phone)
	}
	dateText := time.Now().Format("January 2, 2006")
	if raw := strings.TrimSpace(req.LetterDate); raw != "" {
		if parsed, parseErr := time.Parse("2006-01-02", raw); parseErr == nil {
			dateText = parsed.Format("January 2, 2006")
		} else {
			dateText = raw
		}
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

	return engagementLetterData{
		CompanyName: companyName, ClientID: props.ClientID, ClientName: props.Name, ClientPath: props.Path,
		ClientAddress: props.Address, ClientPhone: props.Phone, ClientEmail: props.Email,
		PreparerName: preparerName, PreparerAddress: preparerAddress, PreparerPhone: phone, PreparerEmail: strings.TrimSpace(preparer.Email),
		Service: service, ServiceDesc: engagementServiceDescription(service), TaxYear: taxYear,
		FeeType: feeType, FeeValue: feeValue, LetterDate: dateText,
		LogoPath: logoPath, LogoWidth: logoWidth, LogoHeight: logoHeight,
	}, nil
}

func engagementServiceDescription(service string) string {
	switch service {
	case "1040":
		return "Form 1040 U.S. Individual Income Tax Return"
	case "1041":
		return "Form 1041 U.S. Income Tax Return for Estates and Trusts"
	case "1065":
		return "Form 1065 U.S. Return of Partnership Income"
	case "1120S":
		return "Form 1120-S U.S. Income Tax Return for an S Corporation"
	case "1120":
		return "Form 1120 U.S. Corporation Income Tax Return"
	case "Bookkeeping":
		return "bookkeeping services"
	case "Tax Projection":
		return "tax projection services"
	default:
		return service
	}
}

func engagementCityStateZIP(user UserProfile) string {
	city := strings.TrimSpace(user.City)
	state := strings.TrimSpace(user.State)
	zipCode := strings.TrimSpace(user.ZIP)
	left := city
	if state != "" {
		if left != "" {
			left += ", " + state
		} else {
			left = state
		}
	}
	if zipCode != "" {
		if left != "" {
			left += " " + zipCode
		} else {
			left = zipCode
		}
	}
	return left
}

func engagementFormatFee(feeType, value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if !strings.HasPrefix(value, "$") {
		value = "$" + value
	}
	lower := strings.ToLower(value)
	if feeType == "Hourly Rate" && !strings.Contains(lower, "/hr") && !strings.Contains(lower, "/hour") && !strings.Contains(lower, "per hour") {
		value += "/hr"
	}
	return value
}

func engagementSafeFilename(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "Client"
	}
	var b strings.Builder
	for _, r := range value {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '.' || r == '_' || r == '-' || r == ' ' {
			b.WriteRune(r)
		}
	}
	value = strings.Join(strings.Fields(b.String()), "_")
	if len(value) > 80 {
		value = value[:80]
	}
	if value == "" {
		return "Client"
	}
	return value
}

func engagementLetterSections(data engagementLetterData) (string, []engagementLetterSection, string) {
	company := data.CompanyName
	if company == "" {
		company = "the Firm"
	}
	client := data.ClientName
	if client == "" {
		client = "the Client"
	}
	intro := fmt.Sprintf("Thank you for engaging %s. This Engagement Letter confirms the terms, scope, and limitations of our engagement with %s for %s for tax year or period %s. Please review this letter carefully because it defines the responsibilities of both the Client and the Firm.", company, client, data.ServiceDesc, data.TaxYear)

	var scope string
	if engagementIsTaxReturnService(data.Service) {
		scope = fmt.Sprintf("%s will prepare the federal %s identified above from information, books, records, schedules, financial statements, and representations provided by %s. State, local, amended, informational, payroll, sales tax, foreign reporting, bookkeeping, notice response, audit, tax planning, tax projection, and other services are outside this engagement unless separately agreed to in writing.", company, data.ServiceDesc, client)
	} else if data.Service == "Bookkeeping" {
		scope = fmt.Sprintf("%s will provide bookkeeping services for %s using bank data, source documents, account information, classifications, instructions, and other records supplied or approved by the Client. The engagement may include recording transactions, reconciliations, and preparation of management reports or financial statements from those records. Unless separately agreed in writing, this engagement does not include an audit, review, compilation, tax return preparation, payroll, sales tax, or assurance service.", company, client)
	} else {
		scope = fmt.Sprintf("%s will prepare tax projections for %s using the income, deduction, withholding, estimated payment, transaction, and other assumptions supplied by the Client. A projection is an estimate based on information available at the time and is not a guarantee of the Client's final tax liability. Actual results may differ because of later transactions, incomplete information, changes in law, or other events.", company, client)
	}

	clientResponsibilities := fmt.Sprintf("%s is responsible for providing complete, accurate, and timely information and for maintaining the books, records, source documents, and supporting evidence required for the services and by applicable tax or regulatory authorities. The Client is responsible for the accuracy and completeness of all financial statements, trial balances, bookkeeping records, schedules, tax documents, classifications, estimates, and representations provided to the Firm, including information received from third parties. The Client must disclose all material facts and must review all returns, reports, projections, or other work product before relying on, signing, or filing it.", client)

	firmResponsibilities := fmt.Sprintf("%s will perform the agreed services using the information, financial statements, books, records, schedules, source documents, and representations supplied by %s or by third parties designated by the Client. Unless a separate written engagement expressly states otherwise, our services are not an audit, review, examination, agreed-upon procedures engagement, or other assurance service, and we will not independently verify or authenticate the information provided to us. We have no duty to discover fraud, embezzlement, misappropriation, illegal acts, errors, omissions, or weaknesses in internal control. Any financial statements, reports, or schedules used or produced from Client-provided accounting information remain the responsibility of Client management, including responsibility for their completeness, accuracy, accounting policies, classifications, estimates, and underlying records. Our work does not relieve the Client of any management, reporting, filing, payment, or recordkeeping responsibility.", company, client)

	reliance := fmt.Sprintf("%s may rely on information supplied by %s without independent verification unless we expressly agree otherwise in writing. Consistent with applicable professional standards, the Firm may make reasonable inquiries, request clarification, or ask for additional supporting documentation when information provided appears incorrect, incomplete, inconsistent, unusual, or otherwise requires clarification, and the Firm may suspend or decline to complete affected work until it is reasonably satisfied that sufficient relevant information has been provided. These inquiries do not constitute an audit, review, examination, or independent verification of the Client's records and do not shift responsibility for the accuracy and completeness of those records from the Client to the Firm. To the fullest extent permitted by applicable law, the Firm will not be responsible for taxes, interest, penalties, losses, damages, costs, missed deadlines, or other consequences arising from incomplete, inaccurate, misclassified, misleading, or late information; Client-prepared financial statements or bookkeeping records; data supplied by banks, payroll providers, investment firms, software systems, or other third parties; the Client's failure to disclose material facts; or the Client's failure to timely act on information or recommendations provided by the Firm. Nothing in this Engagement Letter is intended to limit any responsibility or liability that cannot lawfully be limited or waived.", company, client)

	sections := []engagementLetterSection{
		{Title: "Scope of Services", Body: scope},
		{Title: "Client Responsibilities", Body: clientResponsibilities},
		{Title: "Our Responsibilities and Reliance on Client-Provided Information", Body: firmResponsibilities},
		{Title: "Reliance, Limitations, and Risk Allocation", Body: reliance},
	}
	if engagementIsTaxReturnService(data.Service) {
		sections = append(sections,
			engagementLetterSection{Title: "Tax Positions and Professional Judgment", Body: fmt.Sprintf("%s may ask questions or request additional documentation when information appears incomplete, inconsistent, or unclear. The Firm may decline to take a tax position that it believes lacks adequate support or would cause the Firm to violate applicable law, regulations, or professional standards. The Client remains responsible for the positions reported on the return and for the taxes, interest, and penalties legally due.", company)},
			engagementLetterSection{Title: "Electronic Filing and Authorization", Body: fmt.Sprintf("If the return is eligible for electronic filing, %s will not transmit it until the Firm receives the required signed e-file authorization. Authorization to e-file does not transfer responsibility for the return from the Client to the Firm. The Client is responsible for reviewing the completed return and confirming that the information is complete and accurate before signing the authorization.", company)},
		)
	}
	sections = append(sections,
		engagementLetterSection{Title: "Deadlines, Extensions, and Client Action", Body: fmt.Sprintf("%s agrees to provide requested information sufficiently in advance of applicable deadlines. The Firm cannot guarantee timely completion when information is incomplete or received late. When applicable, an extension of time to file is not an extension of time to pay. Tax payments, estimated payments, elections, signatures, approvals, and other Client actions remain the Client's responsibility unless a separate written agreement specifically provides otherwise.", client)},
		engagementLetterSection{Title: "Fees and Additional Services", Body: fmt.Sprintf("The agreed fee arrangement for this engagement is %s: %s. This fee applies only to the Service identified in this Engagement Letter and is based on the scope, facts, records, and level of professional time reasonably anticipated when this engagement is accepted. If additional information, records, reconciliation, correction, research, analysis, consultation, or professional time is required beyond what was reasonably contemplated, or if the scope or complexity of the engagement materially changes, the Firm will discuss with the Client an additional flat fee or hourly rate before undertaking material out-of-scope work. Any such additional services and related compensation must be mutually agreed upon by the Client and the Firm, which agreement may be documented in writing, including by email, supplemental engagement terms, or other written authorization. Additional work may include amended returns, notices, audit or examination assistance, bookkeeping cleanup, tax research, tax planning, tax projections, or other services outside the stated scope. The Firm may pause work when requested information, authorization, or payment is outstanding, and resulting delays may require revised completion dates and additional fees.", data.FeeType, data.FeeValue)},
		engagementLetterSection{Title: "Records, Confidentiality, and Third-Party Systems", Body: fmt.Sprintf("%s will handle Client information in accordance with applicable professional and legal obligations. The Client should retain original records and supporting documentation. Electronic communication, portals, financial institutions, software providers, and other third-party systems may be used in performing the engagement; those systems are outside the Firm's direct control. The Firm is not responsible for the acts, omissions, outages, or security failures of third-party providers except to the extent responsibility cannot legally be disclaimed.", company)},
		engagementLetterSection{Title: "Termination", Body: fmt.Sprintf("Either %s or %s may terminate this engagement by written notice. The Client remains responsible for fees earned and costs incurred through the termination date and for all filing, payment, recordkeeping, and other deadlines after termination.", client, company)},
	)
	closing := fmt.Sprintf("If the terms above correctly describe your understanding of this engagement, please sign below. Your signature confirms that %s has read, understands, and accepts this Engagement Letter with %s.", client, company)
	return intro, sections, closing
}

func engagementIsTaxReturnService(service string) bool {
	switch service {
	case "1040", "1041", "1065", "1120S", "1120":
		return true
	default:
		return false
	}
}

func engagementPDFBlocks(data engagementLetterData) []engagementPDFBlock {
	intro, sections, closing := engagementLetterSections(data)
	blocks := []engagementPDFBlock{
		{Text: data.LetterDate, Size: 9.5, Align: "right", After: 8},
		{Text: data.CompanyName, Bold: true, Size: 14, After: 2},
		{Text: data.PreparerName, Bold: true, Size: 9.5, After: 1},
	}
	for _, line := range data.PreparerAddress {
		blocks = append(blocks, engagementPDFBlock{Text: line, Size: 9, After: 1})
	}
	if data.PreparerPhone != "" {
		blocks = append(blocks, engagementPDFBlock{Text: data.PreparerPhone, Size: 9, After: 1})
	}
	if data.PreparerEmail != "" {
		blocks = append(blocks, engagementPDFBlock{Text: data.PreparerEmail, Size: 9, After: 1})
	}
	blocks = append(blocks, engagementPDFBlock{Text: data.ClientName, Bold: true, Size: 9.5, Before: 12, After: 2})
	for _, line := range []string{data.ClientAddress, data.ClientPhone, data.ClientEmail} {
		if strings.TrimSpace(line) != "" {
			blocks = append(blocks, engagementPDFBlock{Text: line, Size: 9, After: 1})
		}
	}
	blocks = append(blocks,
		engagementPDFBlock{Text: "Engagement Letter", Bold: true, Size: 15, Align: "center", Before: 14, After: 10},
		engagementPDFBlock{Text: "Type of engagement: " + data.ServiceDesc, Bold: true, Size: 10, After: 2},
		engagementPDFBlock{Text: "Tax Year: " + data.TaxYear, Size: 10, After: 2},
		engagementPDFBlock{Text: data.FeeType + ": " + data.FeeValue, Size: 10, After: 10},
		engagementPDFBlock{Text: "Dear " + data.ClientName + ":", Size: 10, After: 8},
		engagementPDFBlock{Text: intro, Size: 10, After: 8},
	)
	for _, section := range sections {
		blocks = append(blocks,
			engagementPDFBlock{Text: section.Title, Bold: true, Size: 10.5, Before: 5, After: 3},
			engagementPDFBlock{Text: section.Body, Size: 9.6, After: 7},
		)
	}
	blocks = append(blocks,
		engagementPDFBlock{Text: closing, Size: 9.6, Before: 4, After: 18},
		engagementPDFBlock{Text: "Client acceptance:", Bold: true, Size: 10.5, After: 18},
		engagementPDFBlock{Text: data.ClientName + " signature: ____________________________________", Size: 10, After: 5},
		engagementPDFBlock{Text: "Date: ____________________", Size: 10, After: 18},
		engagementPDFBlock{Text: "Firm acknowledgement:", Bold: true, Size: 10.5, After: 18},
		engagementPDFBlock{Text: data.CompanyName + " / " + data.PreparerName + ": ____________________________________", Size: 10, After: 5},
		engagementPDFBlock{Text: "Date: ____________________", Size: 10},
	)
	return blocks
}

func writeEngagementLetterPDF(path string, data engagementLetterData) error {
	blocks := engagementPDFBlocks(data)
	const pageWidth = 612.0
	const pageHeight = 792.0
	const left = 54.0
	const right = 54.0
	const top = 54.0
	const bottom = 52.0
	usable := pageWidth - left - right

	pages := []*strings.Builder{&strings.Builder{}}
	y := pageHeight - top
	if data.LogoPath != "" && data.LogoWidth > 0 && data.LogoHeight > 0 {
		logoW := 120.0
		logoH := logoW * float64(data.LogoHeight) / float64(data.LogoWidth)
		if logoH > 62.0 {
			logoH = 62.0
			logoW = logoH * float64(data.LogoWidth) / float64(data.LogoHeight)
		}
		logoY := pageHeight - top - logoH
		pages[0].WriteString(fmt.Sprintf("q %.2f 0 0 %.2f %.2f %.2f cm /Im1 Do Q\n", logoW, logoH, left, logoY))
		y = logoY - 10
	}
	newPage := func() {
		pages = append(pages, &strings.Builder{})
		y = pageHeight - top
	}
	writeLine := func(text string, bold bool, size float64, align string) {
		leading := size * 1.34
		if y-leading < bottom {
			newPage()
		}
		x := left
		width := engagementApproxTextWidth(text, size)
		if align == "right" {
			x = pageWidth - right - width
		} else if align == "center" {
			x = left + (usable-width)/2
		}
		if x < left {
			x = left
		}
		font := "F1"
		if bold {
			font = "F2"
		}
		pages[len(pages)-1].WriteString(fmt.Sprintf("BT /%s %.2f Tf 1 0 0 1 %.2f %.2f Tm (%s) Tj ET\n", font, size, x, y, engagementPDFEscape(text)))
		y -= leading
	}

	for _, block := range blocks {
		y -= block.Before
		lines := engagementWrapText(block.Text, usable, block.Size)
		if len(lines) == 0 {
			lines = []string{""}
		}
		for _, line := range lines {
			writeLine(line, block.Bold, block.Size, block.Align)
		}
		y -= block.After
	}
	for i := range pages {
		pages[i].WriteString(fmt.Sprintf("BT /F1 7.5 Tf 1 0 0 1 %.2f 28 Tm (Engagement Letter) Tj ET\n", left))
		footer := fmt.Sprintf("Page %d", i+1)
		x := pageWidth - right - engagementApproxTextWidth(footer, 7.5)
		pages[i].WriteString(fmt.Sprintf("BT /F1 7.5 Tf 1 0 0 1 %.2f 28 Tm (%s) Tj ET\n", x, footer))
	}
	streams := make([]string, len(pages))
	for i := range pages {
		streams[i] = pages[i].String()
	}
	return writeSimplePDF(path, streams, data.CompanyName, "Engagement Letter - "+data.ClientName, data.LogoPath, data.LogoWidth, data.LogoHeight)
}

func engagementApproxTextWidth(text string, size float64) float64 {
	width := 0.0
	for _, r := range text {
		switch {
		case r == ' ':
			width += size * 0.28
		case strings.ContainsRune(".,:;!'|ilI()[]", r):
			width += size * 0.28
		case unicode.IsUpper(r):
			width += size * 0.60
		default:
			width += size * 0.50
		}
	}
	return width
}

func engagementWrapText(text string, maxWidth, size float64) []string {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	words := strings.Fields(text)
	if len(words) == 0 {
		return nil
	}
	lines := make([]string, 0)
	current := words[0]
	for _, word := range words[1:] {
		candidate := current + " " + word
		if engagementApproxTextWidth(candidate, size) <= maxWidth {
			current = candidate
			continue
		}
		lines = append(lines, current)
		current = word
	}
	lines = append(lines, current)
	return lines
}

func engagementPDFEscape(value string) string {
	value = strings.NewReplacer(
		"’", "'", "‘", "'", "“", "\"", "”", "\"", "–", "-", "—", "-", "…", "...", "•", "-",
	).Replace(value)
	var b strings.Builder
	for _, r := range value {
		if r < 32 || r > 126 {
			b.WriteByte('?')
			continue
		}
		switch r {
		case '\\', '(', ')':
			b.WriteByte('\\')
			b.WriteRune(r)
		default:
			b.WriteRune(r)
		}
	}
	return b.String()
}

func writeSimplePDF(path string, pageStreams []string, author, title, logoPath string, logoWidth, logoHeight int) error {
	if len(pageStreams) == 0 {
		pageStreams = []string{""}
	}
	var logoBytes []byte
	if logoPath != "" && logoWidth > 0 && logoHeight > 0 {
		if b, err := os.ReadFile(logoPath); err == nil {
			logoBytes = b
		}
	}

	pageCount := len(pageStreams)
	baseAfterPages := 5 + pageCount*2
	imageID := 0
	infoID := baseAfterPages
	if len(logoBytes) > 0 {
		imageID = baseAfterPages
		infoID = baseAfterPages + 1
	}
	objects := make([][]byte, infoID)
	objects[0] = []byte("<< /Type /Catalog /Pages 2 0 R >>")
	kids := make([]string, 0, pageCount)
	for i := 0; i < pageCount; i++ {
		pageID := 5 + i*2
		kids = append(kids, fmt.Sprintf("%d 0 R", pageID))
	}
	objects[1] = []byte(fmt.Sprintf("<< /Type /Pages /Kids [%s] /Count %d >>", strings.Join(kids, " "), pageCount))
	objects[2] = []byte("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
	objects[3] = []byte("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
	for i, stream := range pageStreams {
		pageID := 5 + i*2
		contentID := pageID + 1
		resources := "<< /Font << /F1 3 0 R /F2 4 0 R >>"
		if i == 0 && imageID > 0 {
			resources += fmt.Sprintf(" /XObject << /Im1 %d 0 R >>", imageID)
		}
		resources += " >>"
		objects[pageID-1] = []byte(fmt.Sprintf("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources %s /Contents %d 0 R >>", resources, contentID))
		objects[contentID-1] = []byte(fmt.Sprintf("<< /Length %d >>\nstream\n%sendstream", len(stream), stream))
	}
	if imageID > 0 {
		var imageObj bytes.Buffer
		fmt.Fprintf(&imageObj, "<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length %d >>\nstream\n", logoWidth, logoHeight, len(logoBytes))
		imageObj.Write(logoBytes)
		imageObj.WriteString("\nendstream")
		objects[imageID-1] = imageObj.Bytes()
	}
	objects[infoID-1] = []byte(fmt.Sprintf("<< /Title (%s) /Author (%s) /Creator (BabyFileCab) >>", engagementPDFEscape(title), engagementPDFEscape(author)))

	var buf bytes.Buffer
	buf.WriteString("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")
	offsets := make([]int, len(objects)+1)
	for i, obj := range objects {
		offsets[i+1] = buf.Len()
		fmt.Fprintf(&buf, "%d 0 obj\n", i+1)
		buf.Write(obj)
		buf.WriteString("\nendobj\n")
	}
	xref := buf.Len()
	fmt.Fprintf(&buf, "xref\n0 %d\n", len(objects)+1)
	buf.WriteString("0000000000 65535 f \n")
	for i := 1; i <= len(objects); i++ {
		fmt.Fprintf(&buf, "%010d 00000 n \n", offsets[i])
	}
	fmt.Fprintf(&buf, "trailer\n<< /Size %d /Root 1 0 R /Info %d 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(objects)+1, infoID, xref)
	return os.WriteFile(path, buf.Bytes(), 0600)
}

func writeEngagementLetterDOCX(path string, data engagementLetterData) error {
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	zw := zip.NewWriter(file)
	closeWithError := func(base error) error {
		zipErr := zw.Close()
		fileErr := file.Close()
		if base != nil {
			return base
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

	contentTypes := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
		`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
		`<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
		`<Default Extension="xml" ContentType="application/xml"/>`
	if hasLogo {
		contentTypes += `<Default Extension="jpg" ContentType="image/jpeg"/>`
	}
	contentTypes += `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
		`<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
		`<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
		`<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
		`</Types>`
	rels := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
		`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
		`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
		`<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
		`<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>` +
		`</Relationships>`
	wordRels := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
		`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
		`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
	if hasLogo {
		wordRels += `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/firm-logo.jpg"/>`
	}
	wordRels += `</Relationships>`
	styles := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
		`<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
		`<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/></w:rPr></w:style>` +
		`</w:styles>`
	core := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>%s</dc:title><dc:creator>%s</dc:creator><cp:lastModifiedBy>BabyFileCab</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">%s</dcterms:created></cp:coreProperties>`, xmlText("Engagement Letter - "+data.ClientName), xmlText(data.CompanyName), time.Now().UTC().Format(time.RFC3339))
	app := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>BabyFileCab</Application></Properties>`
	document := engagementDOCXDocument(data, hasLogo)

	for _, item := range []struct{ name, body string }{
		{"[Content_Types].xml", contentTypes},
		{"_rels/.rels", rels},
		{"word/document.xml", document},
		{"word/styles.xml", styles},
		{"word/_rels/document.xml.rels", wordRels},
		{"docProps/core.xml", core},
		{"docProps/app.xml", app},
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

func engagementDOCXDocument(data engagementLetterData, hasLogo bool) string {
	intro, sections, closing := engagementLetterSections(data)
	var body strings.Builder
	if hasLogo {
		body.WriteString(docxLogoParagraph(data.LogoWidth, data.LogoHeight))
	}
	body.WriteString(docxParagraph(data.LetterDate, false, "right", 19, 0))
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
	body.WriteString(docxParagraph(data.ClientName, true, "left", 19, 0))
	for _, line := range []string{data.ClientAddress, data.ClientPhone, data.ClientEmail} {
		if strings.TrimSpace(line) != "" {
			body.WriteString(docxParagraph(line, false, "left", 18, 0))
		}
	}
	body.WriteString(docxParagraph("Engagement Letter", true, "center", 30, 150))
	body.WriteString(docxParagraph("Type of engagement: "+data.ServiceDesc, true, "left", 20, 0))
	body.WriteString(docxParagraph("Tax Year: "+data.TaxYear, false, "left", 20, 0))
	body.WriteString(docxParagraph(data.FeeType+": "+data.FeeValue, false, "left", 20, 120))
	body.WriteString(docxParagraph("Dear "+data.ClientName+":", false, "left", 20, 100))
	body.WriteString(docxParagraph(intro, false, "left", 20, 120))
	for _, section := range sections {
		body.WriteString(docxParagraph(section.Title, true, "left", 21, 30))
		body.WriteString(docxParagraph(section.Body, false, "left", 20, 110))
	}
	body.WriteString(docxParagraph(closing, false, "left", 20, 260))
	body.WriteString(docxParagraph("Client acceptance:", true, "left", 21, 220))
	body.WriteString(docxParagraph(data.ClientName+" signature: ____________________________________", false, "left", 20, 50))
	body.WriteString(docxParagraph("Date: ____________________", false, "left", 20, 240))
	body.WriteString(docxParagraph("Firm acknowledgement:", true, "left", 21, 220))
	body.WriteString(docxParagraph(data.CompanyName+" / "+data.PreparerName+": ____________________________________", false, "left", 20, 50))
	body.WriteString(docxParagraph("Date: ____________________", false, "left", 20, 0))
	body.WriteString(`<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="936" w:right="1123" w:bottom="936" w:left="1123" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`)
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>` + body.String() + `</w:body></w:document>`
}

func docxLogoParagraph(widthPx, heightPx int) string {
	if widthPx <= 0 || heightPx <= 0 {
		return ""
	}
	const emuPerInch = 914400.0
	maxWidth := 1.65 * emuPerInch
	maxHeight := 0.85 * emuPerInch
	cx := maxWidth
	cy := cx * float64(heightPx) / float64(widthPx)
	if cy > maxHeight {
		cy = maxHeight
		cx = cy * float64(widthPx) / float64(heightPx)
	}
	return fmt.Sprintf(`<w:p><w:pPr><w:jc w:val="left"/><w:spacing w:after="80"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="%d" cy="%d"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="Firm Logo"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="firm-logo.jpg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="%d" cy="%d"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`, int64(cx), int64(cy), int64(cx), int64(cy))
}

func docxParagraph(text string, bold bool, align string, sizeHalfPoints int, afterTwips int) string {
	if sizeHalfPoints <= 0 {
		sizeHalfPoints = 20
	}
	var pPr strings.Builder
	if align != "" && align != "left" {
		pPr.WriteString(`<w:jc w:val="` + xmlText(align) + `"/>`)
	}
	if afterTwips > 0 {
		pPr.WriteString(fmt.Sprintf(`<w:spacing w:after="%d"/>`, afterTwips))
	}
	pPrXML := ""
	if pPr.Len() > 0 {
		pPrXML = "<w:pPr>" + pPr.String() + "</w:pPr>"
	}
	boldXML := ""
	if bold {
		boldXML = "<w:b/>"
	}
	return fmt.Sprintf(`<w:p>%s<w:r><w:rPr>%s<w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="%d"/></w:rPr><w:t xml:space="preserve">%s</w:t></w:r></w:p>`, pPrXML, boldXML, sizeHalfPoints, xmlText(text))
}

func xmlText(value string) string {
	return html.EscapeString(value)
}
