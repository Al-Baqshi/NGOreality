package config

import (
	"os"
	"path/filepath"

	"github.com/joho/godotenv"
)

// loadEnvFiles loads the first existing .env files without overriding variables
// already set in the process environment.
func loadEnvFiles() {
	cwd, err := os.Getwd()
	if err != nil {
		_ = godotenv.Load(".env")
		return
	}

	seen := make(map[string]struct{})
	var candidates []string

	dir := cwd
	for i := 0; i < 6; i++ {
		base := dir
		for _, name := range []string{".env", "backend/.env"} {
			p := filepath.Join(base, name)
			if _, ok := seen[p]; ok {
				continue
			}
			if _, err := os.Stat(p); err == nil {
				candidates = append(candidates, p)
				seen[p] = struct{}{}
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}

	// Repo root .env last so backend/.env can override when both exist.
	for i := len(candidates) - 1; i >= 0; i-- {
		_ = godotenv.Load(candidates[i])
	}
}
