/*
  # Badge requests: grant stewardship when the claimant is the listing's email

  After 042, only stewards may insert into badge_requests. That is still the
  right gate for a directory of 29k charities — anyone can claim monitoring,
  and a Reality Badge on a charity you do not run is the product's central
  claim, falsified.

  The portal still offered the request form to every member. Claimers hit
  Postgres 42501 ("new row violates row-level security policy for table
  badge_requests") instead of an explanation.

  Two fixes live here; the form copy lives in the app:

    1. If the account email already matches the organisation's email on file
       (the registry / listing address), they are the organisation. Stamp
       stewardship. Do NOT steward when we just wrote their email onto a blank
       listing — that is how a claimer captures correspondence.

    2. Owners of organisations that were never imported from a registry
       (self-registered between 042 and 047, when 047 forgot to backfill)
       become stewards. There is no rival claimant.

  claim_organization() applies (1) for new claims so the next genuine charity
  is not blocked waiting for a staff click.
*/

-- Existing members whose login already is the listing email.
UPDATE organization_members m
   SET verified_at = coalesce(m.verified_at, m.created_at, now()),
       verified_by = CASE
         WHEN m.verified_at IS NULL THEN 'migration:060 (email matches listing)'
         ELSE m.verified_by
       END
  FROM auth.users u, organizations o
 WHERE m.user_id = u.id
   AND m.organization_id = o.id
   AND m.verified_at IS NULL
   AND coalesce(nullif(trim(o.email), ''), '') <> ''
   AND lower(trim(u.email)) = lower(trim(o.email));

-- Self-registered owners who never received 047's stamp.
UPDATE organization_members m
   SET verified_at = coalesce(m.created_at, now()),
       verified_by = 'migration:060 (self-registered owner)'
  FROM organizations o
 WHERE m.organization_id = o.id
   AND m.role = 'owner'
   AND m.verified_at IS NULL
   AND coalesce(nullif(trim(o.source_registry), ''), '') = '';

CREATE OR REPLACE FUNCTION public.claim_organization(p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_org record;
  v_existing_role text;
  v_managers jsonb;
  v_email_match boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  SELECT id, name, email, status INTO v_org
    FROM organizations
   WHERE id = p_organization_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT role INTO v_existing_role
    FROM organization_members
   WHERE organization_id = p_organization_id AND user_id = v_uid;

  IF FOUND THEN
    RETURN jsonb_build_object('status', 'already_member', 'role', v_existing_role);
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
           'email', coalesce(nullif(pr.email, ''), '(email unavailable)'),
           'full_name', coalesce(pr.full_name, ''),
           'role', m.role
         ) ORDER BY m.created_at)
    INTO v_managers
    FROM organization_members m
    LEFT JOIN profiles pr ON pr.id = m.user_id
   WHERE m.organization_id = p_organization_id;

  IF v_managers IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_managed', 'managers', v_managers);
  END IF;

  -- Steward only when the listing already had this email. Filling a blank
  -- organizations.email with the claimer's address is not proof of control.
  v_email_match :=
    v_email IS NOT NULL
    AND coalesce(nullif(trim(v_org.email), ''), '') <> ''
    AND lower(trim(v_org.email)) = lower(trim(v_email));

  INSERT INTO organization_members (user_id, organization_id, role, verified_at, verified_by)
  VALUES (
    v_uid,
    p_organization_id,
    'owner',
    CASE WHEN v_email_match THEN now() ELSE NULL END,
    CASE WHEN v_email_match THEN 'claim_organization:email_match' ELSE '' END
  );

  IF coalesce(v_org.email, '') = '' AND v_email IS NOT NULL THEN
    UPDATE organizations SET email = v_email WHERE id = p_organization_id;
  END IF;

  IF coalesce(v_org.status, '') = 'listed' THEN
    PERFORM set_config('ngoreality.claim_flow', 'on', true);
    UPDATE organizations
       SET onboarding_stage = coalesce(nullif(onboarding_stage, ''), 'intake')
     WHERE id = p_organization_id;
    PERFORM set_config('ngoreality.claim_flow', 'off', true);
  END IF;

  PERFORM public.seed_verification_criteria(p_organization_id);

  INSERT INTO activity_log (organization_id, action, description, performed_by)
  VALUES (p_organization_id, 'ngo_claim',
          'Organization claimed via NGO portal signup', coalesce(v_email, 'portal user'));

  PERFORM public.insert_portal_notification_staff(
    'ngo_claim',
    'Directory organisation claimed',
    format('%s was claimed by %s (owner)', v_org.name, coalesce(v_email, 'a portal user')),
    '/organizations/' || p_organization_id,
    p_organization_id
  );

  RETURN jsonb_build_object('status', 'claimed', 'role', 'owner', 'organization_id', p_organization_id);
END;
$function$;
