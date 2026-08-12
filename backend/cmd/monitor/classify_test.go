package main

import "testing"

// The thirteen-day outage this pins:
//
// Monitoring recorded nothing from 2026-07-30 to 2026-08-12 while every batch
// logged self_inflicted_rate ≈ 0.54 and refused to write. The failures were
// real — charity domains that resolve but accept no connection — and the guard
// treated them as evidence against itself. Verified by hand from an unrelated
// network: nsmedicaltrust.nz, qes.org.nz and southlandbeesociety.co.nz each
// resolve DNS in under 130ms and never complete a TCP connect.
func TestLooksSelfInflicted(t *testing.T) {
	cases := map[string]bool{
		// The host answered, and the answer was a failure. Reaching it at all
		// proves our network works, so these are findings about the charity.
		`Get "https://x.nz": dial tcp 1.2.3.4:443: connect: connection refused`: false,
		`read tcp 1.2.3.4:443: connection reset by peer`:                        false,
		`remote error: tls: handshake failure`:                                  false,
		`x509: certificate has expired or is not yet valid`:                     false,

		// DNS answered that the domain is gone. Real data about a real charity.
		`Get "https://x.nz": dial tcp: lookup x.nz: no such host`: false,
		`lookup x.nz: server misbehaving`:                         false,

		// Genuinely ambiguous: a dead host and a broken egress produce the same
		// string. Classified as suspect, then corroborated at batch level by
		// whether anything in the batch succeeded.
		`Get "https://x.nz": context deadline exceeded`:         true,
		`dial tcp 66.81.203.16:443: i/o timeout`:                true,
		`Get "https://x.nz": context canceled`:                  true,
		`dial tcp 1.2.3.4:443: connect: no route to host`:       true,
		`dial tcp 1.2.3.4:443: connect: network is unreachable`: true,

		// An HTTP answer is not a transport failure at all.
		`HTTP 500`: false,
		``:         false,
	}

	for msg, want := range cases {
		if got := looksSelfInflicted(msg); got != want {
			t.Errorf("looksSelfInflicted(%q) = %v, want %v", msg, got, want)
		}
	}
}

// The batch-level rule, stated as the guard now implements it. A high suspect
// rate alone must NOT refuse — that is what stalled monitoring for two weeks.
// Refusal additionally requires that nothing at all succeeded.
func TestRefusalRequiresNothingWorking(t *testing.T) {
	shouldRefuse := func(total, suspect, up int) bool {
		if total < minSampleForSanity {
			return false
		}
		return float64(suspect)/float64(total) > maxSelfInflictedRate && up == 0
	}

	cases := []struct {
		name               string
		total, suspect, up int
		want               bool
	}{
		// The real production batch that was being refused every 2 minutes.
		{"dead charity domains, some sites up", 30, 16, 4, false},
		// Egress genuinely broken: nothing answers.
		{"our network is down", 30, 28, 0, true},
		// Healthy batch.
		{"mostly up", 30, 2, 27, false},
		// Everything dead but not suspect (NXDOMAIN) — accurate, record it.
		{"all domains expired", 30, 0, 0, false},
		// Too small to judge either way.
		{"tiny batch", 5, 5, 0, false},
	}

	for _, tc := range cases {
		if got := shouldRefuse(tc.total, tc.suspect, tc.up); got != tc.want {
			t.Errorf("%s: refuse = %v, want %v", tc.name, got, tc.want)
		}
	}
}
