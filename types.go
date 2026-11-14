package main

type CompanyProfile struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	DataDir   string `json:"dataDir"`
	CreatedAt string `json:"createdAt"`
}

type UserProfile struct {
	Username      string `json:"username"`
	FirstName     string `json:"firstName"`
	LastName      string `json:"lastName"`
	Email         string `json:"email"`
	Phone         string `json:"phone"`
	Role          string `json:"role"`
	CompanyID     string `json:"companyId"`
	CompanyName   string `json:"companyName"`
	StreetAddress string `json:"streetAddress,omitempty"`
	City          string `json:"city,omitempty"`
	State         string `json:"state,omitempty"`
	ZIP           string `json:"zip,omitempty"`
	CAF           string `json:"caf,omitempty"`
	PTIN          string `json:"ptin,omitempty"`
	Telephone     string `json:"telephone,omitempty"`
	Fax           string `json:"fax,omitempty"`
	CreatedAt     string `json:"createdAt"`
	VaultStatus   string `json:"vaultStatus,omitempty"`
}

type UserRegistration struct {
	CompanyName     string `json:"companyName"`
	Username        string `json:"username"`
	FirstName       string `json:"firstName"`
	LastName        string `json:"lastName"`
	Email           string `json:"email"`
	Phone           string `json:"phone"`
	Password        string `json:"password"`
	ConfirmPassword string `json:"confirmPassword"`
	Role            string `json:"role"`
	StreetAddress   string `json:"streetAddress"`
	City            string `json:"city"`
	State           string `json:"state"`
	ZIP             string `json:"zip"`
	CAF             string `json:"caf"`
	PTIN            string `json:"ptin"`
	Telephone       string `json:"telephone"`
	Fax             string `json:"fax"`
}

// ExistingCompanyUserRegistration is used when an administrator authorizes
// another Staff or Administrator account to join an existing company.
// The administrator password is verified only for this operation and is never stored.
type ExistingCompanyUserRegistration struct {
	CompanyID       string `json:"companyId"`
	AdminUsername   string `json:"adminUsername"`
	AdminPassword   string `json:"adminPassword"`
	Username        string `json:"username"`
	FirstName       string `json:"firstName"`
	LastName        string `json:"lastName"`
	Email           string `json:"email"`
	Phone           string `json:"phone"`
	Password        string `json:"password"`
	ConfirmPassword string `json:"confirmPassword"`
	Role            string `json:"role"`
	StreetAddress   string `json:"streetAddress"`
	City            string `json:"city"`
	State           string `json:"state"`
	ZIP             string `json:"zip"`
	CAF             string `json:"caf"`
	PTIN            string `json:"ptin"`
	Telephone       string `json:"telephone"`
	Fax             string `json:"fax"`
}

type storedUser struct {
	UserProfile
	PasswordSalt string `json:"passwordSalt"`
	PasswordHash string `json:"passwordHash"`
	Iterations   int    `json:"iterations"`
	PasswordKDF  string `json:"passwordKdf,omitempty"`
	KeyWrapID    string `json:"keyWrapId,omitempty"`
}

type TreeNode struct {
	ID       string     `json:"id"`
	Name     string     `json:"name"`
	ClientID string     `json:"clientId,omitempty"`
	Type     string     `json:"type"`
	Path     string     `json:"path"`
	Done     bool       `json:"done,omitempty"`
	Children []TreeNode `json:"children,omitempty"`
}

type ClientProperties struct {
	Name       string `json:"name"`
	ClientID   string `json:"clientId"`
	Path       string `json:"path"`
	Address    string `json:"address,omitempty"`
	Phone      string `json:"phone,omitempty"`
	Email      string `json:"email,omitempty"`
	TaxID      string `json:"taxId,omitempty"`
	ReturnType string `json:"returnType,omitempty"`
}

type ClientProfile struct {
	Address    string `json:"address"`
	Phone      string `json:"phone"`
	Email      string `json:"email"`
	TaxID      string `json:"taxId"`
	ReturnType string `json:"returnType"`
}

type FirmCalendarAssignment struct {
	Date             string `json:"date"`
	ClientID         string `json:"clientId"`
	ClientName       string `json:"clientName"`
	ClientPath       string `json:"clientPath,omitempty"`
	ReturnType       string `json:"returnType,omitempty"`
	Status           string `json:"status,omitempty"`
	PreparerUsername string `json:"preparerUsername,omitempty"`
}

type storedFirmCalendarAssignment struct {
	Date             string `json:"date"`
	ClientID         string `json:"clientId"`
	ClientName       string `json:"clientName"`
	ReturnType       string `json:"returnType,omitempty"`
	Status           string `json:"status,omitempty"`
	PreparerUsername string `json:"preparerUsername,omitempty"`
}

type TimeSheetEntry struct {
	ID         string  `json:"id"`
	Date       string  `json:"date"`
	ClientID   string  `json:"clientId"`
	ClientName string  `json:"clientName"`
	ClientPath string  `json:"clientPath,omitempty"`
	Work       string  `json:"work,omitempty"`
	Hours      float64 `json:"hours"`
	Username   string  `json:"username"`
	CreatedAt  string  `json:"createdAt"`
}

type ClientCommunication struct {
	Name       string `json:"name"`
	Email      string `json:"email"`
	Phone      string `json:"phone"`
	ReturnType string `json:"returnType"`
	Path       string `json:"path"`
}

type EngagementLetterRequest struct {
	ClientPath       string `json:"clientPath"`
	PreparerUsername string `json:"preparerUsername"`
	Service          string `json:"service"`
	TaxYear          string `json:"taxYear"`
	FeeType          string `json:"feeType"`
	FeeValue         string `json:"feeValue"`
	LetterDate       string `json:"letterDate"`
	OutputPath       string `json:"outputPath"`
}

type EngagementLetterLogoInfo struct {
	Path    string `json:"path"`
	DataURL string `json:"dataURL"`
}

type engagementLetterData struct {
	CompanyName     string
	ClientID        string
	ClientName      string
	ClientPath      string
	ClientAddress   string
	ClientPhone     string
	ClientEmail     string
	PreparerName    string
	PreparerAddress []string
	PreparerPhone   string
	PreparerEmail   string
	Service         string
	ServiceDesc     string
	TaxYear         string
	FeeType         string
	FeeValue        string
	LetterDate      string
	LogoPath        string
	LogoWidth       int
	LogoHeight      int
}

type engagementLetterSection struct {
	Title string
	Body  string
}

type InvoiceRequest struct {
	ClientPath       string `json:"clientPath"`
	PreparerUsername string `json:"preparerUsername"`
	Service          string `json:"service"`
	TaxYear          string `json:"taxYear"`
	InvoiceNumber    string `json:"invoiceNumber"`
	InvoiceDate      string `json:"invoiceDate"`
	DueDate          string `json:"dueDate"`
	FeeType          string `json:"feeType"`
	FeeValue         string `json:"feeValue"`
	Hours            string `json:"hours"`
	Description      string `json:"description"`
	Notes            string `json:"notes"`
	OutputPath       string `json:"outputPath"`
}

type invoiceData struct {
	CompanyName     string
	ClientID        string
	ClientName      string
	ClientPath      string
	ClientAddress   string
	ClientPhone     string
	ClientEmail     string
	PreparerName    string
	PreparerAddress []string
	PreparerPhone   string
	PreparerEmail   string
	Service         string
	ServiceDesc     string
	TaxYear         string
	InvoiceNumber   string
	InvoiceDate     string
	DueDate         string
	FeeType         string
	Rate            float64
	Hours           float64
	Total           float64
	Description     string
	Notes           string
	LogoPath        string
	LogoWidth       int
	LogoHeight      int
}

type engagementPDFBlock struct {
	Text   string
	Bold   bool
	Size   float64
	Align  string
	Before float64
	After  float64
}

type DocumentProperties struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	ClientName  string `json:"clientName"`
	ClientID    string `json:"clientId"`
	Location    string `json:"location"`
	Description string `json:"description"`
	Size        int64  `json:"size"`
	Modified    string `json:"modified"`
}

type GlobalSearchResult struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	ClientName  string `json:"clientName"`
	ClientID    string `json:"clientId"`
	Location    string `json:"location"`
	Description string `json:"description"`
	Match       string `json:"match"`
}

type NotesDocument struct {
	Text string `json:"text"`
	HTML string `json:"html"`
}

type AuditEntry struct {
	Timestamp string `json:"timestamp"`
	Action    string `json:"action"`
	Details   string `json:"details"`
}

// AppAuditEntry is a company-wide audit record. Unlike the per-client audit
// file, it identifies the user and affected client so the Tools > Audit Trail
// window can show activity across the entire BabyFileCab company workspace.
type AppAuditEntry struct {
	Timestamp  string `json:"timestamp"`
	Username   string `json:"username,omitempty"`
	UserName   string `json:"userName,omitempty"`
	Role       string `json:"role,omitempty"`
	ClientID   string `json:"clientId,omitempty"`
	ClientName string `json:"clientName,omitempty"`
	Action     string `json:"action"`
	Details    string `json:"details,omitempty"`
}

type Preview struct {
	Kind      string     `json:"kind"`
	Name      string     `json:"name"`
	Path      string     `json:"path"`
	Text      string     `json:"text,omitempty"`
	ImageData string     `json:"imageData,omitempty"`
	Rows      [][]string `json:"rows,omitempty"`
	PageCount int        `json:"pageCount,omitempty"`
	Message   string     `json:"message,omitempty"`
}

type PDFSearchMatch struct {
	Page       int     `json:"page"`
	Snippet    string  `json:"snippet"`
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	Width      float64 `json:"width"`
	Height     float64 `json:"height"`
	PageWidth  float64 `json:"pageWidth"`
	PageHeight float64 `json:"pageHeight"`
}

type PDFSearchResponse struct {
	Query      string           `json:"query"`
	Total      int              `json:"total"`
	Results    []PDFSearchMatch `json:"results"`
	Searchable bool             `json:"searchable"`
	Message    string           `json:"message,omitempty"`
}

type pdfBBoxWord struct {
	Text string  `xml:",chardata"`
	XMin float64 `xml:"xMin,attr"`
	YMin float64 `xml:"yMin,attr"`
	XMax float64 `xml:"xMax,attr"`
	YMax float64 `xml:"yMax,attr"`
}

type pdfBBoxPage struct {
	Width  float64       `xml:"width,attr"`
	Height float64       `xml:"height,attr"`
	Words  []pdfBBoxWord `xml:"word"`
}

type pdfBBoxDocument struct {
	Pages []pdfBBoxPage `xml:"body>doc>page"`
}
