package payments

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// AUTHORISED is the status Online EFTPOS actually returns for a successful
// payment. It was absent from Succeeded(), which meant a real payment would be
// recorded as failed — money in the bank, nothing on the account.
func TestSucceededRecognisesPaymarkStatuses(t *testing.T) {
	cases := map[string]bool{
		"AUTHORISED": true,
		"authorised": true,
		"AUTHORIZED": true,
		" Approved ": true,
		"DECLINED":   false,
		"EXPIRED":    false,
		"ERROR":      false,
		"":           false,
		"PENDING":    false,
		"WHATEVER":   false,
	}
	for status, want := range cases {
		n := &Notification{Status: status}
		if got := n.Succeeded(); got != want {
			t.Errorf("Succeeded(%q) = %v, want %v", status, got, want)
		}
	}
}

func TestFormatAmount(t *testing.T) {
	cases := map[int64]string{
		7000:  "70.00",
		100:   "1.00",
		5:     "0.05",
		65000: "650.00",
		0:     "0.00",
	}
	for cents, want := range cases {
		if got := formatAmount(cents); got != want {
			t.Errorf("formatAmount(%d) = %q, want %q", cents, got, want)
		}
	}
}

func TestConfiguredRequiresAllThreeCredentials(t *testing.T) {
	cases := []struct {
		name             string
		key, secret, mid string
		want             bool
	}{
		{"all present", "k", "s", "m", true},
		{"no merchant id", "k", "s", "", false},
		{"no key", "", "s", "m", false},
		{"no secret", "k", "", "m", false},
		{"nothing", "", "", "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := NewClient(Sandbox, tc.key, tc.secret, tc.mid).Configured(); got != tc.want {
				t.Fatalf("Configured() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestUUIDV4Shape(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 100; i++ {
		id, err := uuidV4()
		if err != nil {
			t.Fatalf("uuidV4: %v", err)
		}
		if len(id) != 36 {
			t.Fatalf("length %d, want 36: %q", len(id), id)
		}
		if id[14] != '4' {
			t.Fatalf("version nibble = %q, want '4': %q", id[14], id)
		}
		if !strings.ContainsRune("89ab", rune(id[19])) {
			t.Fatalf("variant nibble = %q, want one of 89ab: %q", id[19], id)
		}
		if seen[id] {
			t.Fatalf("duplicate uuid %q", id)
		}
		seen[id] = true
	}
}

// CreateIntent must refuse a plain-http notification URL. Paymark will not call
// back to one, and a callback that never arrives is indistinguishable from a
// customer who never paid — the worst possible failure to debug.
func TestCreateIntentRejectsNonHTTPSNotificationURL(t *testing.T) {
	c := NewClient(Sandbox, "k", "s", "m")
	_, err := c.CreateIntent(context.Background(), IntentRequest{
		AmountCents:     100,
		Reference:       "NGR-TEST",
		NotificationURL: "http://localhost:8080/callback",
	})
	if err == nil || !strings.Contains(err.Error(), "https") {
		t.Fatalf("expected an https complaint, got %v", err)
	}
}

func TestCreateIntentSendsExpectedRequest(t *testing.T) {
	var tokenAuth, intentAuth string
	var body map[string]any

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/bearer":
			tokenAuth = r.Header.Get("Authorization")
			if err := r.ParseForm(); err != nil {
				t.Errorf("parse form: %v", err)
			}
			if got := r.Form.Get("grant_type"); got != "client_credentials" {
				t.Errorf("grant_type = %q", got)
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"tok-123","token_type":"Bearer","expires_in":3600}`))
		case "/oe/transactions/v2/payments/create-intent":
			intentAuth = r.Header.Get("Authorization")
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Errorf("decode: %v", err)
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"paymentId":"pay-1","merchantTransactionId":"mt-1","paymentUrl":"https://pay.example/x"}`))
		default:
			t.Errorf("unexpected path %s", r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	c := NewClient(Sandbox, "mykey", "mysecret", "MERCH1")
	c.baseOverride = srv.URL

	got, err := c.CreateIntent(context.Background(), IntentRequest{
		AmountCents:     7000,
		Reference:       "NGR-ABCD1234",
		NotificationURL: "https://api.ngoreality.com/v1/payments/paymark/callback",
		ReturnURL:       "https://www.ngoreality.com/public/payment-complete",
	})
	if err != nil {
		t.Fatalf("CreateIntent: %v", err)
	}
	if got.PaymentURL != "https://pay.example/x" || got.PaymentID != "pay-1" {
		t.Fatalf("unexpected intent: %+v", got)
	}

	wantBasic := "Basic " + base64.StdEncoding.EncodeToString([]byte("mykey:mysecret"))
	if tokenAuth != wantBasic {
		t.Errorf("token auth = %q, want %q", tokenAuth, wantBasic)
	}
	if intentAuth != "Bearer tok-123" {
		t.Errorf("intent auth = %q, want %q", intentAuth, "Bearer tok-123")
	}

	// The amount must travel as a decimal string; sending 7000 would charge
	// seven thousand dollars.
	pay, _ := body["oepayment"].(map[string]any)
	if pay["amount"] != "70.00" {
		t.Errorf("amount = %v, want \"70.00\"", pay["amount"])
	}
	if pay["currency"] != "NZD" {
		t.Errorf("currency = %v", pay["currency"])
	}
	if pay["reference"] != "NGR-ABCD1234" {
		t.Errorf("reference = %v", pay["reference"])
	}
	merch, _ := body["merchant"].(map[string]any)
	if merch["merchantId"] != "MERCH1" {
		t.Errorf("merchantId = %v", merch["merchantId"])
	}
	if merch["notificationUrl"] != "https://api.ngoreality.com/v1/payments/paymark/callback" {
		t.Errorf("notificationUrl = %v", merch["notificationUrl"])
	}
	if body["integrationMode"] != "HOSTED" {
		t.Errorf("integrationMode = %v, want HOSTED", body["integrationMode"])
	}
}

// A 2xx with no paymentUrl leaves nowhere to send the payer, so it must be an
// error rather than a button that goes nowhere.
func TestCreateIntentFailsWhenNoPaymentURL(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/bearer" {
			_, _ = w.Write([]byte(`{"access_token":"t","expires_in":3600}`))
			return
		}
		_, _ = w.Write([]byte(`{"paymentId":"pay-1"}`))
	}))
	defer srv.Close()

	c := NewClient(Sandbox, "k", "s", "m")
	c.baseOverride = srv.URL

	_, err := c.CreateIntent(context.Background(), IntentRequest{
		AmountCents:     100,
		Reference:       "NGR-TEST",
		NotificationURL: "https://example.com/cb",
	})
	if err == nil || !strings.Contains(err.Error(), "paymentUrl") {
		t.Fatalf("expected a paymentUrl complaint, got %v", err)
	}
}
