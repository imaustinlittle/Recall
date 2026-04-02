// ── Auth ───────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
  created_at: string;
}

export interface Token {
  access_token: string;
  token_type: string;
}

// ── Meetings ───────────────────────────────────────────────────────────────
export type MeetingStatus =
  | "pending"
  | "uploading"
  | "queued"
  | "processing"
  | "transcribed"
  | "failed";

export interface Meeting {
  id: string;
  user_id: string;
  title: string;
  status: MeetingStatus;
  description: string | null;
  tags: string[] | null;
  recorded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeetingListOut {
  items: Meeting[];
  total: number;
  page: number;
  limit: number;
}

// ── Speakers ───────────────────────────────────────────────────────────────
export interface Speaker {
  id: string;
  meeting_id: string;
  label: string;
  display_name: string | null;
  color_hex: string;
  avatar_url: string | null;
}

// ── Transcript ─────────────────────────────────────────────────────────────
export interface TranscriptSegment {
  id: string;
  meeting_id: string;
  speaker_id: string | null;
  speaker: Speaker | null;
  segment_index: number;
  start_time: number;
  end_time: number;
  content: string;
  confidence: number | null;
  is_edited: boolean;
  edited_at: string | null;
}

// ── Jobs ───────────────────────────────────────────────────────────────────
export type JobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface Job {
  id: string;
  meeting_id: string;
  celery_task_id: string | null;
  job_type: string;
  status: JobStatus;
  progress: number;
  message: string | null;
  error_info: Record<string, string> | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}
