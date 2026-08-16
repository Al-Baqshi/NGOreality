-- Corrects 052, which was wrong in a way that quietly manufactured data.
--
-- Its host regex could begin matching immediately after the '@', so an address
-- yielded its own domain: 'http://wsa@wsa.org.nz' became 'https://wsa.org.nz',
-- and 'https://cheviotshow@gmail.com / www.showplace.nz' became
-- 'https://gmail.com' -- discarding the real site and publishing a link to
-- Gmail as a charity's homepage. The token-level guard (`token !~ '@'`) could
-- not catch it, because the '@' sits before the token rather than inside it.
--
-- The ORDER of operations was the bug: find a host, then reject addresses.
-- Reversed here -- strip every address from the string first, then look for a
-- host in whatever survives. A value that was only ever an address then has
-- nothing left and correctly clears.
--
-- Restores from the activity_log rows 052 wrote before it changed anything.
-- DISTINCT ON keeps the earliest record per organisation, so the true pre-052
-- value is used even if this is ever re-run. The function body is superseded
-- by 054, which generalises it from addresses to URL userinfo.

WITH originals AS (
  SELECT DISTINCT ON (organization_id)
         organization_id,
         substring(description from 'Original: (.*)$') AS original
    FROM activity_log
   WHERE action = 'website_url_sanitized'
   ORDER BY organization_id, created_at
)
UPDATE organizations o
   SET website_url = public.sanitize_website_url(originals.original)
  FROM originals
 WHERE o.id = originals.organization_id;

INSERT INTO activity_log (organization_id, action, description, performed_by)
SELECT DISTINCT ON (organization_id)
       organization_id,
       'website_url_sanitize_corrected',
       'Re-applied the corrected sanitizer; 052 had salvaged the address''s own domain',
       'migration_053'
  FROM activity_log
 WHERE action = 'website_url_sanitized'
 ORDER BY organization_id, created_at;
