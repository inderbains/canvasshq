-- RealVolt Existing Funnel: automatic, evidence-based stage updates.
-- Apply after supabase/003_crm.sql, 016_marketing_showings_foundation.sql,
-- and 023_crm_automation_engine.sql. Additive; no existing deals or leads are removed.
-- Only confirmed activities can advance a stage; never automatically mark a deal Closed.
BEGIN;

CREATE TABLE IF NOT EXISTS public.rv_funnel_auto_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  origin text NOT NULL CHECK (origin IN ('Logged activity','Showing confirmed')),
  source_id uuid NOT NULL,
  previous_stage text NOT NULL,
  new_stage text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id,origin,source_id)
);
CREATE INDEX IF NOT EXISTS rv_funnel_auto_events_owner_time
  ON public.rv_funnel_auto_events(user_id,created_at DESC);
ALTER TABLE public.rv_funnel_auto_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rv_funnel_auto_events_read ON public.rv_funnel_auto_events;
CREATE POLICY rv_funnel_auto_events_read ON public.rv_funnel_auto_events FOR SELECT
  TO authenticated USING (user_id=(SELECT auth.uid()));
REVOKE ALL ON public.rv_funnel_auto_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.rv_funnel_auto_events TO authenticated;
GRANT ALL ON public.rv_funnel_auto_events TO service_role;

-- A logged Call, Email, or Meeting is actual contact activity. A generic note is NOT.
CREATE OR REPLACE FUNCTION public.rv_funnel_on_crm_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_before text; v_name text;
BEGIN
  -- Agent-site RPC records a dedicated note for each deduplicated inquiry.
  -- Create a task even if the CRM contact already existed; never advance its stage.
  IF NEW.activity_type='Note' AND NEW.body LIKE 'Website contact inquiry%' THEN
    SELECT c.full_name INTO v_name FROM public.crm_contacts c
      WHERE c.id=NEW.contact_id AND c.user_id=NEW.user_id;
    IF FOUND THEN
      INSERT INTO public.crm_tasks (user_id,contact_id,title,due_date,priority)
      VALUES (NEW.user_id,NEW.contact_id,
        'Respond to website inquiry — '||left(v_name,100),CURRENT_DATE,'High');
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.activity_type NOT IN ('Call','Email','Meeting') THEN RETURN NEW; END IF;
  SELECT c.stage INTO v_before FROM public.crm_contacts c
    WHERE c.id=NEW.contact_id AND c.user_id=NEW.user_id FOR UPDATE;
  IF v_before IS DISTINCT FROM 'New' THEN RETURN NEW; END IF;
  UPDATE public.crm_contacts SET stage='Contacted'
    WHERE id=NEW.contact_id AND user_id=NEW.user_id AND stage='New';
  IF FOUND THEN
    INSERT INTO public.rv_funnel_auto_events
      (user_id,contact_id,origin,source_id,previous_stage,new_stage)
    VALUES (NEW.user_id,NEW.contact_id,'Logged activity',NEW.id,'New','Contacted')
    ON CONFLICT (contact_id,origin,source_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rv_funnel_contact_activity ON public.crm_notes;
CREATE TRIGGER rv_funnel_contact_activity AFTER INSERT ON public.crm_notes
  FOR EACH ROW EXECUTE FUNCTION public.rv_funnel_on_crm_activity();

-- A confirmed/completed showing promotes only the LINKED buyer's record.
-- Pending/declined/rescheduled showings never advance a lead.
-- Do not regress manual stages or override Under contract, Closed, or Lost.
CREATE OR REPLACE FUNCTION public.rv_funnel_on_showing_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_before text;
BEGIN
  IF NEW.status NOT IN ('Confirmed','Completed') OR NEW.status IS NOT DISTINCT FROM OLD.status
     OR NEW.contact_id IS NULL THEN RETURN NEW; END IF;
  SELECT c.stage INTO v_before FROM public.crm_contacts c
    WHERE c.id=NEW.contact_id AND c.user_id=NEW.user_id FOR UPDATE;
  IF v_before NOT IN ('New','Contacted','Qualified') THEN RETURN NEW; END IF;
  UPDATE public.crm_contacts SET stage='Active'
    WHERE id=NEW.contact_id AND user_id=NEW.user_id
    AND stage IN ('New','Contacted','Qualified');
  IF FOUND THEN
    INSERT INTO public.rv_funnel_auto_events
      (user_id,contact_id,origin,source_id,previous_stage,new_stage)
    VALUES (NEW.user_id,NEW.contact_id,'Showing confirmed',NEW.id,v_before,'Active')
    ON CONFLICT (contact_id,origin,source_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rv_funnel_showing_confirmed ON public.property_showing_requests;
CREATE TRIGGER rv_funnel_showing_confirmed AFTER UPDATE OF status ON public.property_showing_requests
  FOR EACH ROW EXECUTE FUNCTION public.rv_funnel_on_showing_status();

-- A newly imported Meta CSV lead needs an initial human follow-up.
-- Website inquiries are handled on their RPC note above (including existing contacts).
-- Open house and showing integrations already create follow-up tasks in their own RPCs.
-- All tasks remain agent-private; no outbound messaging occurs.
CREATE OR REPLACE FUNCTION public.rv_funnel_on_inbound_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.stage <> 'New' OR NEW.source NOT LIKE 'Meta Lead Ads%' THEN RETURN NEW; END IF;
  INSERT INTO public.crm_tasks (user_id,contact_id,title,due_date,priority)
  VALUES (NEW.user_id,NEW.id,'Follow up with '||left(NEW.full_name,110)||' — Meta lead',
    CURRENT_DATE,'High');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rv_funnel_new_inbound_followup ON public.crm_contacts;
CREATE TRIGGER rv_funnel_new_inbound_followup AFTER INSERT ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.rv_funnel_on_inbound_contact();

REVOKE ALL ON FUNCTION public.rv_funnel_on_crm_activity() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.rv_funnel_on_showing_status() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.rv_funnel_on_inbound_contact() FROM PUBLIC,anon,authenticated;
COMMIT;
