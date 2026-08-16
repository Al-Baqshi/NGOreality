-- 56 charity email addresses were publicly readable.
--
-- Migrations 044/046 kept `email` and `phone` off the public surface, and both
-- hold. But the NZ registry import put addresses into `website_url` for 56
-- organisations -- 'http://wsa@wsa.org.nz' and similar -- and website_url IS
-- published, because a charity directory that hid websites would be useless.
-- The address leaked through the column beside the one that was protected.
--
-- Originals are captured in activity_log BEFORE anything changes, so the whole
-- sequence stays reversible. That mattered more than expected: the sanitizer
-- introduced here was wrong (see 053), and these audit rows are the only reason
-- the damage could be repaired rather than guessed at.
--
-- The function body written here was superseded twice; 054 carries the final
-- version. This file is kept for the audit capture and backfill it performed,
-- which 053 depends on.

INSERT INTO activity_log (organization_id, action, description, performed_by)
SELECT id,
       'website_url_sanitized',
       format('Removed an email address published in website_url. Original: %s', website_url),
       'migration_052'
  FROM organizations
 WHERE coalesce(website_url, '') <> ''
   AND website_url ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}';
