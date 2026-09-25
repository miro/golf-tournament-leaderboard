export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type Database = {
  public: {
    Tables: {
      bettor_accounts: {
        Row: { id: string; display_name: string; pin: string; identity_token: string; created_at: string }
        Insert: Omit<Database['public']['Tables']['bettor_accounts']['Row'], 'id' | 'identity_token' | 'created_at'> & { identity_token?: string }
        Update: Partial<Database['public']['Tables']['bettor_accounts']['Insert']>
      }
      leagues: {
        Row: {
          id: string; name: string; slug: string; tournament_name: string
          primary_color: string; secondary_color: string; logo_url: string | null
          domain: string | null; subdomain: string | null; active: boolean
          bg_dark: string; bg_card: string; bg_card_hover: string; text_muted: string
          border_muted: string; border_accent: string
          features: { invitational: boolean; betting: boolean; hype_tools: boolean; skins: boolean }
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['leagues']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['leagues']['Insert']>
      }
      players: {
        Row: {
          id: string
          full_name: string
          slug: string
          personal_link_token: string
          hcp_fallback: number | null
          hcp_history: Json
          titles: Json
          avatar_url: string | null
          active: boolean
          created_at: string
          invitational_tagline: string | null
          invitational_2026: boolean
          league_id: string
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
          league_id: string
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
          league_id: string
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
          league_id: string
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
          league_id: string | null
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
          league_id: string | null
        }
        Insert: Omit<Database['public']['Tables']['invitational_schedule']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['invitational_schedule']['Insert']>
      }
      league_events: {
        Row: { id: string; league_id: string; name: string; event_date: string; course_id: string | null; status: 'draft' | 'betting_open' | 'betting_closed' | 'scoring' | 'results_ready' | 'presented'; betting_url_token: string; participant_code: string | null; created_at: string }
        Insert: Omit<Database['public']['Tables']['league_events']['Row'], 'id' | 'betting_url_token' | 'created_at'> & { betting_url_token?: string }
        Update: Partial<Database['public']['Tables']['league_events']['Insert']>
      }
      league_event_players: {
        Row: { event_id: string; player_id: string; display_order: number }
        Insert: Database['public']['Tables']['league_event_players']['Row']
        Update: Partial<Database['public']['Tables']['league_event_players']['Insert']>
      }
      betting_question_types: {
        Row: { id: string; key: string; display_name: string; description: string; max_points: number; requires_target_player: boolean; active: boolean }
        Insert: Omit<Database['public']['Tables']['betting_question_types']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['betting_question_types']['Insert']>
      }
      betting_questions: {
        Row: { id: string; event_id: string; question_type_id: string; question_type_key: string | null; display_order: number; question_text: string | null; points_possible: number | null; parameters: Json; correct_answer: Json }
        Insert: Omit<Database['public']['Tables']['betting_questions']['Row'], 'id' | 'correct_answer'> & { correct_answer?: Json }
        Update: Partial<Database['public']['Tables']['betting_questions']['Insert']>
      }
      betting_participants: {
        Row: { id: string; event_id: string; display_name: string; emoji_pin: string | null; pin: string | null; identity_token: string | null; bettor_account_id: string | null; is_event_player: boolean; submitted_at: string; total_points_awarded: number }
        Insert: Omit<Database['public']['Tables']['betting_participants']['Row'], 'id' | 'submitted_at' | 'total_points_awarded'>
        Update: Partial<Database['public']['Tables']['betting_participants']['Insert']>
      }
      bets: {
        Row: { id: string; participant_id: string; question_id: string; answer: Json; points_awarded: number | null; points_breakdown: Json }
        Insert: Omit<Database['public']['Tables']['bets']['Row'], 'id' | 'points_awarded' | 'points_breakdown'> & { points_awarded?: number | null; points_breakdown?: Json }
        Update: Partial<Database['public']['Tables']['bets']['Insert']>
      }
      event_scores: {
        Row: { id: string; event_id: string; player_id: string; hcp: number | null; total_points: number; total_strokes: number | null; has_complete_strokes: boolean; submitted_at: string; is_corrected: boolean }
        Insert: Omit<Database['public']['Tables']['event_scores']['Row'], 'id' | 'submitted_at' | 'is_corrected' | 'has_complete_strokes'> & { is_corrected?: boolean }
        Update: Partial<Database['public']['Tables']['event_scores']['Insert']>
      }
      event_hole_results: {
        Row: { id: string; event_score_id: string; hole: number; par: number | null; stroke_index: number | null; strokes_played: number | null; hcp_strokes: number | null; points: number }
        Insert: Omit<Database['public']['Tables']['event_hole_results']['Row'], 'id' | 'par' | 'stroke_index' | 'strokes_played' | 'hcp_strokes'> & Partial<Pick<Database['public']['Tables']['event_hole_results']['Row'], 'par' | 'stroke_index' | 'strokes_played' | 'hcp_strokes'>>
        Update: Partial<Database['public']['Tables']['event_hole_results']['Insert']>
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
export type League = Database['public']['Tables']['leagues']['Row']

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
