// Package domain holds the CRM entity types shared by the store and HTTP layers.
package domain

import "time"

type Client struct {
	ID            string         `json:"id"`
	ReferenceCode *string        `json:"reference_code"`
	GivenName     string         `json:"given_name"`
	FamilyName    string         `json:"family_name"`
	PreferredName *string        `json:"preferred_name"`
	DateOfBirth   *time.Time     `json:"date_of_birth"`
	ContactEmail  *string        `json:"contact_email"`
	ContactPhone  *string        `json:"contact_phone"`
	AddressLine1  *string        `json:"address_line1"`
	AddressLine2  *string        `json:"address_line2"`
	City          *string        `json:"city"`
	Region        *string        `json:"region"`
	Postcode      *string        `json:"postcode"`
	Country       *string        `json:"country"`
	Status        string         `json:"status"`
	Custom        map[string]any `json:"custom"`
	CreatedBy     *string        `json:"created_by"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`

	// Populated only for roles permitted to see it; omitted otherwise so the
	// field's absence is unambiguous to the client.
	Sensitive *ClientSensitive `json:"sensitive,omitempty"`
}

type ClientSensitive struct {
	Ethnicity      *string        `json:"ethnicity"`
	IwiAffiliation *string        `json:"iwi_affiliation"`
	Gender         *string        `json:"gender"`
	HealthNotes    *string        `json:"health_notes"`
	LegalStatus    *string        `json:"legal_status"`
	RiskFlags      []string       `json:"risk_flags"`
	Data           map[string]any `json:"data"`
	UpdatedAt      time.Time      `json:"updated_at"`
}

type Consent struct {
	ID          string     `json:"id"`
	ClientID    string     `json:"client_id"`
	Purpose     string     `json:"purpose"`
	Method      string     `json:"method"`
	Evidence    *string    `json:"evidence"`
	GrantedAt   time.Time  `json:"granted_at"`
	ExpiresAt   *time.Time `json:"expires_at"`
	WithdrawnAt *time.Time `json:"withdrawn_at"`
	CollectedBy *string    `json:"collected_by"`
	CreatedAt   time.Time  `json:"created_at"`
}

type Case struct {
	ID            string         `json:"id"`
	ClientID      string         `json:"client_id"`
	ReferenceCode *string        `json:"reference_code"`
	Title         string         `json:"title"`
	ServiceType   *string        `json:"service_type"`
	Status        string         `json:"status"`
	Priority      string         `json:"priority"`
	AssignedTo    *string        `json:"assigned_to"`
	OpenedAt      time.Time      `json:"opened_at"`
	DueAt         *time.Time     `json:"due_at"`
	ClosedAt      *time.Time     `json:"closed_at"`
	ClosureReason *string        `json:"closure_reason"`
	Outcome       *string        `json:"outcome"`
	Custom        map[string]any `json:"custom"`
	CreatedBy     *string        `json:"created_by"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
}

type CaseNote struct {
	ID         string    `json:"id"`
	CaseID     string    `json:"case_id"`
	AuthorID   *string   `json:"author_id"`
	Body       string    `json:"body"`
	Visibility string    `json:"visibility"`
	CreatedAt  time.Time `json:"created_at"`
}

type Session struct {
	ID              string         `json:"id"`
	ClientID        string         `json:"client_id"`
	CaseID          *string        `json:"case_id"`
	OccurredAt      time.Time      `json:"occurred_at"`
	ServiceType     *string        `json:"service_type"`
	DeliveryMode    *string        `json:"delivery_mode"`
	DurationMinutes *int           `json:"duration_minutes"`
	Attendees       *int           `json:"attendees"`
	Outcome         *string        `json:"outcome"`
	Notes           *string        `json:"notes"`
	Custom          map[string]any `json:"custom"`
	RecordedBy      *string        `json:"recorded_by"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
}

type Document struct {
	ID          string    `json:"id"`
	ClientID    *string   `json:"client_id"`
	CaseID      *string   `json:"case_id"`
	StoragePath string    `json:"storage_path"`
	Filename    string    `json:"filename"`
	MimeType    *string   `json:"mime_type"`
	SizeBytes   *int64    `json:"size_bytes"`
	Sensitivity string    `json:"sensitivity"`
	UploadedBy  *string   `json:"uploaded_by"`
	UploadedAt  time.Time `json:"uploaded_at"`
}

// FieldDef is the per-tenant customisation escape hatch.
type FieldDef struct {
	ID         string     `json:"id"`
	Entity     string     `json:"entity"`
	Key        string     `json:"key"`
	Label      string     `json:"label"`
	DataType   string     `json:"data_type"`
	Options    []string   `json:"options"`
	Required   bool       `json:"required"`
	Sensitive  bool       `json:"sensitive"`
	SortOrder  int        `json:"sort_order"`
	ArchivedAt *time.Time `json:"archived_at"`
	CreatedAt  time.Time  `json:"created_at"`
}

type ServiceType struct {
	ID        string    `json:"id"`
	Key       string    `json:"key"`
	Label     string    `json:"label"`
	Active    bool      `json:"active"`
	SortOrder int       `json:"sort_order"`
	CreatedAt time.Time `json:"created_at"`
}

type Settings struct {
	ClientRetentionMonths int            `json:"client_retention_months"`
	CollectionNotice      string         `json:"collection_notice"`
	CaseReferencePrefix   string         `json:"case_reference_prefix"`
	Branding              map[string]any `json:"branding"`
	UpdatedAt             time.Time      `json:"updated_at"`
}

// Stats is the funder-reporting aggregate.
type Stats struct {
	ClientsTotal           int            `json:"clients_total"`
	ClientsActive          int            `json:"clients_active"`
	ClientsNewInPeriod     int            `json:"clients_new_in_period"`
	CasesOpen              int            `json:"cases_open"`
	CasesClosedInPeriod    int            `json:"cases_closed_in_period"`
	CasesOverdue           int            `json:"cases_overdue"`
	SessionsInPeriod       int            `json:"sessions_in_period"`
	SessionMinutesInPeriod int            `json:"session_minutes_in_period"`
	ClientsServedInPeriod  int            `json:"clients_served_in_period"`
	SessionsByServiceType  map[string]int `json:"sessions_by_service_type"`
	PeriodFrom             time.Time      `json:"period_from"`
	PeriodTo               time.Time      `json:"period_to"`
}

// Page wraps a list response with its total for server-side pagination.
type Page[T any] struct {
	Items  []T `json:"items"`
	Total  int `json:"total"`
	Limit  int `json:"limit"`
	Offset int `json:"offset"`
}
