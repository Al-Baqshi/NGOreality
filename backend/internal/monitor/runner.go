package monitor

import (
	"context"
	"log/slog"
	"sync"

	"ngoreality/backend/internal/config"
	"ngoreality/backend/internal/store"
)

type Runner struct {
	cfg     config.Config
	store   *store.Store
	checker *Checker
	log     *slog.Logger
}

func NewRunner(cfg config.Config, st *store.Store, log *slog.Logger) *Runner {
	if log == nil {
		log = slog.Default()
	}
	return &Runner{
		cfg:     cfg,
		store:   st,
		checker: NewChecker(cfg.CheckTimeout),
		log:     log,
	}
}

type RunSummary struct {
	Synced     int
	Checked    int
	Up         int
	Down       int
	UrlInvalid int
	Errors     int
}

func (r *Runner) RunOnce(ctx context.Context) (RunSummary, error) {
	var summary RunSummary

	synced, err := r.store.SyncMonitors(ctx, r.cfg.MonitorStatuses)
	if err != nil {
		return summary, err
	}
	summary.Synced = synced
	r.log.Info("monitors synced", "upserted", synced)

	const batchSize = 500
	for {
		monitors, err := r.store.ListDueMonitors(ctx, batchSize)
		if err != nil {
			return summary, err
		}
		if len(monitors) == 0 {
			break
		}

		sem := make(chan struct{}, r.cfg.CheckConcurrency)
		var wg sync.WaitGroup
		var mu sync.Mutex

		for _, m := range monitors {
			wg.Add(1)
			go func(m store.Monitor) {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()

				checkCtx, cancel := context.WithTimeout(ctx, r.cfg.CheckTimeout)
				defer cancel()

				normalized, normErr := NormalizeURL(m.URL)
				if normErr != nil {
					// Bad URL is a data-quality issue, not an outage.
					// Mark as url_invalid so it is excluded from down counts
					// and does not open an incident.
					if err := r.store.RecordUrlInvalid(checkCtx, m.OrganizationID, m.URL, normErr.Error()); err != nil {
						r.log.Error("record url_invalid failed", "org", m.OrganizationID, "err", err)
						mu.Lock()
						summary.Errors++
						mu.Unlock()
						return
					}
					mu.Lock()
					summary.UrlInvalid++
					mu.Unlock()
					return
				}

				result := r.checker.Check(checkCtx, normalized)
				rec := store.CheckRecord{
					OrganizationID: m.OrganizationID,
					URL:            normalized,
					IsUp:           result.IsUp,
					StatusCode:     result.StatusCode,
					LatencyMS:      result.LatencyMS,
					ErrorMessage:   result.ErrorMessage,
				}
				if err := r.store.RecordCheck(checkCtx, rec, r.cfg.CheckFailureThreshold); err != nil {
					r.log.Error("record check failed", "org", m.OrganizationID, "err", err)
					mu.Lock()
					summary.Errors++
					mu.Unlock()
					return
				}

				mu.Lock()
				summary.Checked++
				if result.IsUp {
					summary.Up++
				} else {
					summary.Down++
				}
				mu.Unlock()
			}(m)
		}
		wg.Wait()

		if len(monitors) < batchSize {
			break
		}
	}

	r.log.Info("check cycle complete",
		"checked", summary.Checked,
		"up", summary.Up,
		"down", summary.Down,
		"url_invalid", summary.UrlInvalid,
		"errors", summary.Errors,
	)
	return summary, nil
}
