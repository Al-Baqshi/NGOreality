/*
  # Inquiry read_at — sidebar Inbox pill clears when staff open an enquiry

  Status stays new/contacted/qualified/closed for the pipeline.
  Opening the inquiry records read_at so the nav count is unread work, not
  every new row forever.
*/

ALTER TABLE public.inquiry_submissions
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_inquiry_submissions_unread
  ON public.inquiry_submissions (created_at DESC)
  WHERE read_at IS NULL AND status = 'new';
