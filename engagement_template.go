package main

import (
	"errors"
	"fmt"
	"os"
	"regexp"
	"strings"
)

// The engagement letter wording is a firm-wide template. Administrators can
// edit it; everyone else uses it as saved. Placeholders in braces are filled
// in for each letter.

type EngagementTemplateSection struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	// AppliesTo is "all", or a service kind: "tax-return", "bookkeeping", "projection".
	AppliesTo string `json:"appliesTo"`
}

type EngagementTemplate struct {
	Intro    string                      `json:"intro"`
	Sections []EngagementTemplateSection `json:"sections"`
	Closing  string                      `json:"closing"`
}

type EngagementPlaceholder struct {
	Name    string `json:"name"`
	Meaning string `json:"meaning"`
}

type EngagementTemplateInfo struct {
	Template     EngagementTemplate      `json:"template"`
	Default      EngagementTemplate      `json:"default"`
	Custom       bool                    `json:"custom"`
	Placeholders []EngagementPlaceholder `json:"placeholders"`
	// NotIncluded gives {not_included} for each service code, so the preview
	// can fill it the same way the letter does.
	NotIncluded map[string]string `json:"notIncluded"`
}

var engagementPlaceholders = []EngagementPlaceholder{
	{"firm", "Your firm's name"},
	{"client", "The client's name"},
	{"service", "The service, for example \"Form 1040 U.S. Individual Income Tax Return\""},
	{"year", "The tax year or period"},
	{"fee_type", "Flat Fee or Hourly Rate"},
	{"fee", "The fee or hourly rate, for example $1,500 or $250/hr"},
	{"not_included", "Work a tax-return engagement leaves out (state returns, amended returns, notices…), minus the service itself"},
}

const engagementTemplateKey = "engagement-template"

func defaultEngagementTemplate() EngagementTemplate {
	return EngagementTemplate{
		Intro: "Thank you for engaging {firm}. This Engagement Letter confirms the terms, scope, and limitations of our engagement with {client} for {service} for tax year or period {year}. Please review this letter carefully because it defines the responsibilities of both the Client and the Firm.",
		Sections: []EngagementTemplateSection{
			{Title: "Scope of Services", AppliesTo: "tax-return",
				Body: "{firm} will prepare the {service} identified above from information, books, records, schedules, financial statements, and representations provided by {client}. Unless separately agreed to in writing, this engagement does not include {not_included}."},
			{Title: "Scope of Services", AppliesTo: "bookkeeping",
				Body: "{firm} will provide bookkeeping services for {client} using bank data, source documents, account information, classifications, instructions, and other records supplied or approved by the Client. The engagement may include recording transactions, reconciliations, and preparation of management reports or financial statements from those records. Unless separately agreed in writing, this engagement does not include an audit, review, compilation, tax return preparation, payroll, sales tax, or assurance service."},
			{Title: "Scope of Services", AppliesTo: "projection",
				Body: "{firm} will prepare tax projections for {client} using the income, deduction, withholding, estimated payment, transaction, and other assumptions supplied by the Client. A projection is an estimate based on information available at the time and is not a guarantee of the Client's final tax liability. Actual results may differ because of later transactions, incomplete information, changes in law, or other events."},
			{Title: "Client Responsibilities", AppliesTo: "all",
				Body: "{client} is responsible for providing complete, accurate, and timely information and for maintaining the books, records, source documents, and supporting evidence required for the services and by applicable tax or regulatory authorities. The Client is responsible for the accuracy and completeness of all financial statements, trial balances, bookkeeping records, schedules, tax documents, classifications, estimates, and representations provided to the Firm, including information received from third parties. The Client must disclose all material facts and must review all returns, reports, projections, or other work product before relying on, signing, or filing it."},
			{Title: "Our Responsibilities and Reliance on Client-Provided Information", AppliesTo: "all",
				Body: "{firm} will perform the agreed services using the information, financial statements, books, records, schedules, source documents, and representations supplied by {client} or by third parties designated by the Client. Unless a separate written engagement expressly states otherwise, our services are not an audit, review, examination, agreed-upon procedures engagement, or other assurance service, and we will not independently verify or authenticate the information provided to us. We have no duty to discover fraud, embezzlement, misappropriation, illegal acts, errors, omissions, or weaknesses in internal control. Any financial statements, reports, or schedules used or produced from Client-provided accounting information remain the responsibility of Client management, including responsibility for their completeness, accuracy, accounting policies, classifications, estimates, and underlying records. Our work does not relieve the Client of any management, reporting, filing, payment, or recordkeeping responsibility."},
			{Title: "Reliance, Limitations, and Risk Allocation", AppliesTo: "all",
				Body: "{firm} may rely on information supplied by {client} without independent verification unless we expressly agree otherwise in writing. Consistent with applicable professional standards, the Firm may make reasonable inquiries, request clarification, or ask for additional supporting documentation when information provided appears incorrect, incomplete, inconsistent, unusual, or otherwise requires clarification, and the Firm may suspend or decline to complete affected work until it is reasonably satisfied that sufficient relevant information has been provided. These inquiries do not constitute an audit, review, examination, or independent verification of the Client's records and do not shift responsibility for the accuracy and completeness of those records from the Client to the Firm. To the fullest extent permitted by applicable law, the Firm will not be responsible for taxes, interest, penalties, losses, damages, costs, missed deadlines, or other consequences arising from incomplete, inaccurate, misclassified, misleading, or late information; Client-prepared financial statements or bookkeeping records; data supplied by banks, payroll providers, investment firms, software systems, or other third parties; the Client's failure to disclose material facts; or the Client's failure to timely act on information or recommendations provided by the Firm. Nothing in this Engagement Letter is intended to limit any responsibility or liability that cannot lawfully be limited or waived."},
			{Title: "Tax Positions and Professional Judgment", AppliesTo: "tax-return",
				Body: "{firm} may ask questions or request additional documentation when information appears incomplete, inconsistent, or unclear. The Firm may decline to take a tax position that it believes lacks adequate support or would cause the Firm to violate applicable law, regulations, or professional standards. The Client remains responsible for the positions reported on the return and for the taxes, interest, and penalties legally due."},
			{Title: "Electronic Filing and Authorization", AppliesTo: "tax-return",
				Body: "If the return is eligible for electronic filing, {firm} will not transmit it until the Firm receives the required signed e-file authorization. Authorization to e-file does not transfer responsibility for the return from the Client to the Firm. The Client is responsible for reviewing the completed return and confirming that the information is complete and accurate before signing the authorization."},
			{Title: "Deadlines, Extensions, and Client Action", AppliesTo: "all",
				Body: "{client} agrees to provide requested information sufficiently in advance of applicable deadlines. The Firm cannot guarantee timely completion when information is incomplete or received late. When applicable, an extension of time to file is not an extension of time to pay. Tax payments, estimated payments, elections, signatures, approvals, and other Client actions remain the Client's responsibility unless a separate written agreement specifically provides otherwise."},
			{Title: "Fees and Additional Services", AppliesTo: "all",
				Body: "The agreed fee arrangement for this engagement is {fee_type}: {fee}. This fee applies only to the Service identified in this Engagement Letter and is based on the scope, facts, records, and level of professional time reasonably anticipated when this engagement is accepted. If additional information, records, reconciliation, correction, research, analysis, consultation, or professional time is required beyond what was reasonably contemplated, or if the scope or complexity of the engagement materially changes, the Firm will discuss with the Client an additional flat fee or hourly rate before undertaking material out-of-scope work. Any such additional services and related compensation must be mutually agreed upon by the Client and the Firm, which agreement may be documented in writing, including by email, supplemental engagement terms, or other written authorization. Additional work may include amended returns, notices, audit or examination assistance, bookkeeping cleanup, tax research, tax planning, tax projections, or other services outside the stated scope. The Firm may pause work when requested information, authorization, or payment is outstanding, and resulting delays may require revised completion dates and additional fees."},
			{Title: "Records, Confidentiality, and Third-Party Systems", AppliesTo: "all",
				Body: "{firm} will handle Client information in accordance with applicable professional and legal obligations. The Client should retain original records and supporting documentation. Electronic communication, portals, financial institutions, software providers, and other third-party systems may be used in performing the engagement; those systems are outside the Firm's direct control. The Firm is not responsible for the acts, omissions, outages, or security failures of third-party providers except to the extent responsibility cannot legally be disclaimed."},
			{Title: "Termination", AppliesTo: "all",
				Body: "Either {client} or {firm} may terminate this engagement by written notice. The Client remains responsible for fees earned and costs incurred through the termination date and for all filing, payment, recordkeeping, and other deadlines after termination."},
		},
		Closing: "If the terms above correctly describe your understanding of this engagement, please sign below. Your signature confirms that {client} has read, understands, and accepts this Engagement Letter with {firm}.",
	}
}

func (a *App) loadEngagementTemplate() (EngagementTemplate, bool) {
	var t EngagementTemplate
	if err := a.metadataJSONGet("settings", engagementTemplateKey, &t); err != nil || len(t.Sections) == 0 {
		return defaultEngagementTemplate(), false
	}
	return t, true
}

func (a *App) GetEngagementTemplate() (EngagementTemplateInfo, error) {
	if err := a.requireSignedIn(); err != nil {
		return EngagementTemplateInfo{}, err
	}
	t, custom := a.loadEngagementTemplate()
	notIncluded := map[string]string{}
	for _, s := range firmServices {
		notIncluded[s.Code] = notIncludedServices(s.Code)
	}
	return EngagementTemplateInfo{Template: t, Default: defaultEngagementTemplate(), Custom: custom, Placeholders: engagementPlaceholders, NotIncluded: notIncluded}, nil
}

var placeholderPattern = regexp.MustCompile(`\{([a-z_]+)\}`)

func checkEngagementPlaceholders(where, text string) error {
	for _, m := range placeholderPattern.FindAllStringSubmatch(text, -1) {
		known := false
		for _, p := range engagementPlaceholders {
			if p.Name == m[1] {
				known = true
				break
			}
		}
		if !known {
			return fmt.Errorf("%s uses {%s}, which BabyFileCab doesn't know. Placeholders are: %s", where, m[1], placeholderList())
		}
	}
	return nil
}

func placeholderList() string {
	names := make([]string, len(engagementPlaceholders))
	for i, p := range engagementPlaceholders {
		names[i] = "{" + p.Name + "}"
	}
	return strings.Join(names, ", ")
}

func validateEngagementTemplate(t *EngagementTemplate) error {
	t.Intro = strings.TrimSpace(t.Intro)
	t.Closing = strings.TrimSpace(t.Closing)
	if t.Intro == "" || t.Closing == "" {
		return errors.New("the opening and closing paragraphs can't be empty")
	}
	if len(t.Sections) == 0 {
		return errors.New("keep at least one section")
	}
	if len(t.Sections) > 40 {
		return errors.New("a letter can have at most 40 sections")
	}
	if err := checkEngagementPlaceholders("The opening paragraph", t.Intro); err != nil {
		return err
	}
	if err := checkEngagementPlaceholders("The closing paragraph", t.Closing); err != nil {
		return err
	}
	for i := range t.Sections {
		s := &t.Sections[i]
		s.Title = strings.TrimSpace(s.Title)
		s.Body = strings.TrimSpace(s.Body)
		if s.Title == "" || s.Body == "" {
			return fmt.Errorf("section %d needs both a heading and some text", i+1)
		}
		if len(s.Title) > 200 || len(s.Body) > 10000 {
			return fmt.Errorf("section %q is too long", s.Title)
		}
		switch s.AppliesTo {
		case "all", "tax-return", "bookkeeping", "projection":
		default:
			return fmt.Errorf("section %q has an unknown service type", s.Title)
		}
		if err := checkEngagementPlaceholders(fmt.Sprintf("Section %q", s.Title), s.Title+" "+s.Body); err != nil {
			return err
		}
	}
	return nil
}

// SaveEngagementTemplate stores the firm's wording. Administrators only.
func (a *App) SaveEngagementTemplate(t EngagementTemplate) error {
	if err := a.requireAdministrator("change the engagement letter wording"); err != nil {
		return err
	}
	if err := validateEngagementTemplate(&t); err != nil {
		return err
	}
	if err := a.metadataJSONPut("settings", engagementTemplateKey, t); err != nil {
		return err
	}
	_ = a.appendAppAuditCurrent("", "", "Engagement letter wording changed", fmt.Sprintf("%d sections", len(t.Sections)))
	return nil
}

// ResetEngagementTemplate goes back to BabyFileCab's standard wording.
func (a *App) ResetEngagementTemplate() error {
	if err := a.requireAdministrator("change the engagement letter wording"); err != nil {
		return err
	}
	if err := a.metadataDelete("settings", engagementTemplateKey); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	_ = a.appendAppAuditCurrent("", "", "Engagement letter wording reset to standard", "")
	return nil
}

func fillEngagementText(text string, values map[string]string) string {
	return placeholderPattern.ReplaceAllStringFunc(text, func(m string) string {
		if v, ok := values[m[1:len(m)-1]]; ok {
			return v
		}
		return m
	})
}

// renderEngagementTemplate picks the sections that apply to the service and
// fills in the placeholders.
func renderEngagementTemplate(t EngagementTemplate, data engagementLetterData) (string, []engagementLetterSection, string) {
	firm := data.CompanyName
	if firm == "" {
		firm = "the Firm"
	}
	client := data.ClientName
	if client == "" {
		client = "the Client"
	}
	values := map[string]string{
		"firm": firm, "client": client, "service": data.ServiceDesc, "year": data.TaxYear,
		"fee_type": data.FeeType, "fee": data.FeeValue, "not_included": notIncludedServices(data.Service),
	}
	kind := "tax-return"
	if s, ok := findFirmService(data.Service); ok {
		kind = s.Kind
	}
	var sections []engagementLetterSection
	for _, s := range t.Sections {
		if s.AppliesTo == "all" || s.AppliesTo == kind {
			sections = append(sections, engagementLetterSection{Title: fillEngagementText(s.Title, values), Body: fillEngagementText(s.Body, values)})
		}
	}
	return fillEngagementText(t.Intro, values), sections, fillEngagementText(t.Closing, values)
}
