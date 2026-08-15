export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type Database = {
  public: {
    Tables: {
      players: {
        Row: {
          id: string
          full_name: string
          slug: string
          personal_link_token: string
          hcp_current: number | null
          hcp_history: Json
          titles: Json
          avatar_url: string | null
          active: boolean
          created_at: string
          invitational_tagline: string | null
        }
        // invitational_tagline is optional on insert — it is authored separately, not
        // supplied when a player is first created.
        Insert: Omit<
          Database['public']['Tables']['players']['Row'],
          'id' | 'created_at' | 'personal_link_token' | 'invitational_tagline'
        > & { invitational_tagline?: string | null }
        Update: Partial<Database['public']['Tables']['players']['Insert']>
      }
      seasons: {
        Row: {
          id: string
          year: number
          name: string
          type: 'kesäkisa' | 'tahko_major'
          status: 'upcoming' | 'active' | 'completed'
          deadline: string
          winner_player_id: string | null
          announced_at: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['seasons']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['seasons']['Insert']>
      }
      courses: {
        Row: {
          id: string
          name: string
          slug: string
          location_city: string
          par_total: number
          cover_photo_url: string | null
          color_hex: string | null
          website_url: string | null
          summary_text: string | null
          latitude: number | null
          longitude: number | null
        }
        Insert: Omit<Database['public']['Tables']['courses']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['courses']['Insert']>
      }
      season_courses: {
        Row: {
          id: string
          season_id: string
          course_id: string
          display_order: number
        }
        Insert: Omit<Database['public']['Tables']['season_courses']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['season_courses']['Insert']>
      }
      admins: {
        Row: {
          id: string
          name: string
          email: string
          password_hash: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['admins']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['admins']['Insert']>
      }
      rounds: {
        Row: {
          id: string
          season_id: string
          course_id: string
          player_id: string
          submitted_by: string | null
          played_date: string
          submitted_at: string
          hcp_at_time: number | null
          total_strokes: number | null
          total_points: number
          to_par: number | null
          screenshot_url: string | null
          summary_text: string | null
          status: 'draft' | 'published' | 'corrected'
          correction_note: string | null
          is_backfill: boolean
        }
        Insert: Omit<Database['public']['Tables']['rounds']['Row'], 'id' | 'submitted_at'>
        Update: Partial<Database['public']['Tables']['rounds']['Insert']>
      }
      hole_results: {
        Row: {
          id: string
          round_id: string
          hole_number: number
          par: number
          stroke_index: number
          strokes_played: number | null
          handicap_strokes: number
          points: number
        }
        Insert: Omit<Database['public']['Tables']['hole_results']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['hole_results']['Insert']>
      }
      round_cards: {
        Row: {
          id: string
          round_id: string | null
          card_type: 'round' | 'standings' | 'course_leader' | 'deadline' | 'final'
          share_text: string | null
          generated_at: string
        }
        Insert: Omit<Database['public']['Tables']['round_cards']['Row'], 'id' | 'generated_at'>
        Update: Partial<Database['public']['Tables']['round_cards']['Insert']>
      }
      invitational_results: {
        Row: {
          id: string
          year: number
          liekkipoika_winner: string | null
          liekkipoika_winner_player_id: string | null
          scratch_winner: string | null
          scratch_winner_player_id: string | null
          scratch_shots: number | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['invitational_results']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['invitational_results']['Insert']>
      }
      invitational_schedule: {
        Row: {
          id: string
          year: number
          /** 'friday' | 'saturday' | 'sunday' — the UI groups on event_date instead. */
          day: string
          /** ISO date; the weekday heading is derived from it. */
          event_date: string
          display_order: number
          /** 'HH:MM:SS' from Postgres `time`, or null when the event has no fixed time. */
          start_time: string | null
          category: 'golf' | 'transport' | 'food' | 'social' | 'ceremony' | 'logistics'
          title: string
          subtitle: string | null
          location: string | null
          tee_times: string[] | null
          is_highlight: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['invitational_schedule']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['invitational_schedule']['Insert']>
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

// Convenience row types
export type Player = Database['public']['Tables']['players']['Row']
export type Season = Database['public']['Tables']['seasons']['Row']
export type Course = Database['public']['Tables']['courses']['Row']
export type Round = Database['public']['Tables']['rounds']['Row']
export type HoleResult = Database['public']['Tables']['hole_results']['Row']
export type RoundCard = Database['public']['Tables']['round_cards']['Row']
export type Admin = Database['public']['Tables']['admins']['Row']
export type InvitationalResult = Database['public']['Tables']['invitational_results']['Row']
export type InvitationalScheduleEvent = Database['public']['Tables']['invitational_schedule']['Row']

// Enriched types used in UI
export interface LeaderboardEntry {
  player: Player
  total_points: number
  rounds_played: number
  rank: number
  courses_played: string[]
  points_by_course: Record<string, number>
}

export interface RoundWithDetails extends Round {
  player: Player
  course: Course
  rank_after?: number
  rank_before?: number
}
