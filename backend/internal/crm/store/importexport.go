package store

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// ---------------------------------------------------------------------------
// CSV export
//
// Most NGOs are migrating off a spreadsheet and will want to get back out
// again. Refusing to export is a lock-in tactic, and for beneficiary data an
// NGO has a legitimate need to hold its own copy.
// ---------------------------------------------------------------------------

// ExportClients streams clients as CSV. Sensitive columns are included only
// when the caller may see them, and their presence is visible in the header
// so an export is never ambiguous about what it contains.
func ExportClients(ctx context.Context, tx pgx.Tx, w io.Writer, withSensitive bool) (int, error) {
	cw := csv.NewWriter(w)
	defer cw.Flush()

	header := []string{
		"id", "reference_code", "given_name", "family_name", "preferred_name",
		"date_of_birth", "contact_email", "contact_phone", "address_line1",
		"address_line2", "city", "region", "postcode", "country", "status",
		"created_at",
	}
	if withSensitive {
		header = append(header, "ethnicity", "iwi_affiliation", "gender",
			"health_notes", "legal_status", "risk_flags")
	}
	if err := cw.Write(header); err != nil {
		return 0, err
	}

	q := `SELECT c.id, c.reference_code, c.given_name, c.family_name, c.preferred_name,
	             c.date_of_birth, c.contact_email, c.contact_phone, c.address_line1,
	             c.address_line2, c.city, c.region, c.postcode, c.country, c.status,
	             c.created_at`
	if withSensitive {
		q += `, s.ethnicity, s.iwi_affiliation, s.gender, s.health_notes,
		       s.legal_status, s.risk_flags
		        FROM clients c LEFT JOIN client_sensitive s ON s.client_id = c.id`
	} else {
		q += ` FROM clients c`
	}
	q += ` ORDER BY c.family_name, c.given_name`

	rows, err := tx.Query(ctx, q)
	if err != nil {
		return 0, fmt.Errorf("export clients: %w", err)
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var (
			id, givenName, familyName, status string
			createdAt                         time.Time
			dob                               *time.Time
			refCode, preferred, email, phone  *string
			addr1, addr2, city, region        *string
			postcode, country                 *string
			ethnicity, iwi, gender            *string
			health, legal                     *string
			riskFlags                         []string
		)

		dest := []any{&id, &refCode, &givenName, &familyName, &preferred, &dob,
			&email, &phone, &addr1, &addr2, &city, &region, &postcode, &country,
			&status, &createdAt}
		if withSensitive {
			dest = append(dest, &ethnicity, &iwi, &gender, &health, &legal, &riskFlags)
		}
		if err := rows.Scan(dest...); err != nil {
			return count, err
		}

		rec := []string{id, str(refCode), givenName, familyName, str(preferred),
			dateStr(dob), str(email), str(phone), str(addr1), str(addr2),
			str(city), str(region), str(postcode), str(country), status,
			createdAt.Format(time.RFC3339)}
		if withSensitive {
			rec = append(rec, str(ethnicity), str(iwi), str(gender), str(health),
				str(legal), strings.Join(riskFlags, "|"))
		}
		if err := cw.Write(rec); err != nil {
			return count, err
		}
		count++
	}
	return count, rows.Err()
}

// ExportSessions streams the service delivery log — the raw material behind a
// funder report.
func ExportSessions(ctx context.Context, tx pgx.Tx, w io.Writer, from, to time.Time) (int, error) {
	cw := csv.NewWriter(w)
	defer cw.Flush()

	if err := cw.Write([]string{
		"id", "client_id", "client_name", "case_id", "occurred_at", "service_type",
		"delivery_mode", "duration_minutes", "attendees", "outcome",
	}); err != nil {
		return 0, err
	}

	rows, err := tx.Query(ctx, `
		SELECT s.id, s.client_id,
		       trim(coalesce(c.given_name,'') || ' ' || coalesce(c.family_name,'')),
		       s.case_id, s.occurred_at, s.service_type, s.delivery_mode,
		       s.duration_minutes, s.attendees, s.outcome
		  FROM sessions s
		  JOIN clients c ON c.id = s.client_id
		 WHERE s.occurred_at >= $1 AND s.occurred_at < $2
		 ORDER BY s.occurred_at DESC`, from, to)
	if err != nil {
		return 0, fmt.Errorf("export sessions: %w", err)
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var (
			id, clientID, clientName           string
			caseID, serviceType, mode, outcome *string
			occurredAt                         time.Time
			duration, attendees                *int
		)
		if err := rows.Scan(&id, &clientID, &clientName, &caseID, &occurredAt,
			&serviceType, &mode, &duration, &attendees, &outcome); err != nil {
			return count, err
		}
		if err := cw.Write([]string{
			id, clientID, clientName, str(caseID), occurredAt.Format(time.RFC3339),
			str(serviceType), str(mode), intStr(duration), intStr(attendees), str(outcome),
		}); err != nil {
			return count, err
		}
		count++
	}
	return count, rows.Err()
}

func str(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func intStr(p *int) string {
	if p == nil {
		return ""
	}
	return strconv.Itoa(*p)
}

func dateStr(p *time.Time) string {
	if p == nil {
		return ""
	}
	return p.Format("2006-01-02")
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

// ImportResult reports what happened, row by row, so a partial import is
// diagnosable rather than a silent count.
type ImportResult struct {
	Imported int           `json:"imported"`
	Skipped  int           `json:"skipped"`
	Errors   []ImportError `json:"errors"`
}

type ImportError struct {
	Row     int    `json:"row"`
	Message string `json:"message"`
}

const maxImportRows = 10000

// canonicalHeader maps the spellings real spreadsheets use onto our fields.
var canonicalHeader = map[string]string{
	"first name": "given_name", "firstname": "given_name", "given name": "given_name",
	"given_name": "given_name",
	"last name":  "family_name", "lastname": "family_name", "surname": "family_name",
	"family name": "family_name", "family_name": "family_name",
	"preferred name": "preferred_name", "preferred_name": "preferred_name",
	"email": "contact_email", "email address": "contact_email", "contact_email": "contact_email",
	"phone": "contact_phone", "mobile": "contact_phone", "contact_phone": "contact_phone",
	"dob": "date_of_birth", "date of birth": "date_of_birth", "birthdate": "date_of_birth",
	"date_of_birth": "date_of_birth",
	"address":       "address_line1", "address 1": "address_line1", "address_line1": "address_line1",
	"address 2": "address_line2", "address_line2": "address_line2",
	"city": "city", "town": "city", "suburb": "city",
	"region": "region", "state": "region",
	"postcode": "postcode", "post code": "postcode", "zip": "postcode",
	"country":   "country",
	"reference": "reference_code", "reference code": "reference_code",
	"client id": "reference_code", "reference_code": "reference_code",
	"status": "status",
}

var dateLayouts = []string{
	"2006-01-02", "02/01/2006", "2/1/2006", "01/02/2006",
	"2006/01/02", "02-01-2006", time.RFC3339,
}

// ImportClients reads a CSV and inserts clients. Unknown columns are carried
// into `custom` rather than dropped, so a spreadsheet migration does not lose
// information the NGO was relying on.
//
// A row that fails is recorded and skipped; the rest still import. The caller
// runs this inside the tenant transaction, so it commits or rolls back whole.
func ImportClients(ctx context.Context, tx pgx.Tx, r io.Reader, actor string) (*ImportResult, error) {
	cr := csv.NewReader(r)
	cr.FieldsPerRecord = -1
	cr.TrimLeadingSpace = true

	header, err := cr.Read()
	if err != nil {
		return nil, fmt.Errorf("could not read the CSV header: %w", err)
	}

	// Map each column to a known field, or keep its label for `custom`.
	fields := make([]string, len(header))
	customLabels := make([]string, len(header))
	known := 0
	for i, h := range header {
		// Excel prefixes a UTF-8 BOM, which would otherwise corrupt the first
		// column name and silently lose that column on every Excel export.
		clean := strings.TrimSpace(strings.ToLower(strings.TrimPrefix(h, "\ufeff")))
		if canonical, ok := canonicalHeader[clean]; ok {
			fields[i] = canonical
			known++
		} else if clean != "" {
			customLabels[i] = customKey(clean)
		}
	}
	if known == 0 {
		return nil, fmt.Errorf("no recognisable columns: expected at least a name column (e.g. \"First name\", \"Last name\")")
	}

	result := &ImportResult{Errors: []ImportError{}}

	for rowNum := 2; ; rowNum++ {
		record, err := cr.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			result.Errors = append(result.Errors, ImportError{Row: rowNum, Message: err.Error()})
			result.Skipped++
			continue
		}
		if result.Imported+result.Skipped >= maxImportRows {
			result.Errors = append(result.Errors, ImportError{
				Row:     rowNum,
				Message: fmt.Sprintf("import stopped at the %d row limit; split the file and import again", maxImportRows),
			})
			break
		}

		in := ClientInput{Status: "active", Custom: map[string]any{}}
		for i, value := range record {
			if i >= len(fields) {
				break
			}
			value = strings.TrimSpace(value)
			if value == "" {
				continue
			}
			switch fields[i] {
			case "given_name":
				in.GivenName = value
			case "family_name":
				in.FamilyName = value
			case "preferred_name":
				in.PreferredName = &value
			case "contact_email":
				in.ContactEmail = &value
			case "contact_phone":
				in.ContactPhone = &value
			case "reference_code":
				in.ReferenceCode = &value
			case "address_line1":
				in.AddressLine1 = &value
			case "address_line2":
				in.AddressLine2 = &value
			case "city":
				in.City = &value
			case "region":
				in.Region = &value
			case "postcode":
				in.Postcode = &value
			case "country":
				in.Country = &value
			case "status":
				if v := strings.ToLower(value); v == "active" || v == "inactive" || v == "closed" {
					in.Status = v
				}
			case "date_of_birth":
				if parsed, ok := parseFlexibleDate(value); ok {
					in.DateOfBirth = &parsed
				} else {
					result.Errors = append(result.Errors, ImportError{
						Row:     rowNum,
						Message: fmt.Sprintf("could not read date of birth %q — use YYYY-MM-DD or DD/MM/YYYY", value),
					})
				}
			default:
				if label := customLabels[i]; label != "" {
					in.Custom[label] = value
				}
			}
		}

		if strings.TrimSpace(in.GivenName) == "" && strings.TrimSpace(in.FamilyName) == "" {
			result.Skipped++
			result.Errors = append(result.Errors, ImportError{Row: rowNum, Message: "no name in this row"})
			continue
		}

		// Each row gets a savepoint so one bad row does not abort the
		// surrounding transaction and lose every good row before it.
		if _, err := tx.Exec(ctx, "SAVEPOINT import_row"); err != nil {
			return result, err
		}
		if _, err := CreateClient(ctx, tx, in, actor); err != nil {
			_, _ = tx.Exec(ctx, "ROLLBACK TO SAVEPOINT import_row")
			result.Skipped++
			result.Errors = append(result.Errors, ImportError{Row: rowNum, Message: cleanDBError(err)})
			continue
		}
		if _, err := tx.Exec(ctx, "RELEASE SAVEPOINT import_row"); err != nil {
			return result, err
		}
		result.Imported++
	}

	return result, nil
}

// parseFlexibleDate accepts the formats spreadsheets actually produce.
// Note DD/MM/YYYY is tried before MM/DD/YYYY: this is a New Zealand product.
func parseFlexibleDate(v string) (string, bool) {
	for _, layout := range dateLayouts {
		if t, err := time.Parse(layout, v); err == nil {
			return t.Format("2006-01-02"), true
		}
	}
	return "", false
}

func customKey(label string) string {
	var b strings.Builder
	lastUnderscore := false
	for _, r := range label {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			lastUnderscore = false
		default:
			if !lastUnderscore && b.Len() > 0 {
				b.WriteByte('_')
				lastUnderscore = true
			}
		}
	}
	return strings.Trim(b.String(), "_")
}

// cleanDBError keeps import feedback useful without leaking SQL internals.
func cleanDBError(err error) string {
	msg := err.Error()
	if strings.Contains(msg, "duplicate key") && strings.Contains(msg, "reference_code") {
		return "a client with this reference code already exists"
	}
	if idx := strings.Index(msg, " (SQLSTATE"); idx > 0 {
		msg = msg[:idx]
	}
	if len(msg) > 200 {
		msg = msg[:200]
	}
	return msg
}
