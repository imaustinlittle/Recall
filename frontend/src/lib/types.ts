// ── Auth ───────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
  is_admin: boolean;
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
  folder_id: string | null;
  retention_exempt: boolean;
  recorded_at: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

// ── Folders & tags ─────────────────────────────────────────────────────────
export interface Folder {
  id: string;
  user_id: string;
  name: string;
  color_hex: string;
  created_at: string;
  meeting_count: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

// ── Transcript chat ────────────────────────────────────────────────────────
export interface ChatCitation {
  start_time: number;
  snippet: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: ChatCitation[] | null;
  created_at: string;
}

export interface ChatThread {
  indexed: boolean;
  chunk_count: number;
  messages: ChatMessage[];
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
  voice_profile_id: string | null;
}

// ── Voice profiles ─────────────────────────────────────────────────────────
export interface VoiceProfile {
  id: string;
  user_id: string;
  name: string;
  sample_count: number;
  created_at: string;
  updated_at: string;
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

// ── Notes ──────────────────────────────────────────────────────────────────
export type NoteType = "general" | "action_item" | "decision" | "question";

export interface Note {
  id: string;
  meeting_id: string;
  user_id: string;
  note_type: NoteType;
  body: string;
  timestamp_ref: number | null;
  is_action_item: boolean;
  is_decision: boolean;
  created_at: string;
  updated_at: string;
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
