export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      amendment_seats: {
        Row: {
          accepts: boolean | null
          added_at: string
          amendment_id: string
          answered_at: string | null
          role: string
          seat_id: string
        }
        Insert: {
          accepts?: boolean | null
          added_at?: string
          amendment_id: string
          answered_at?: string | null
          role: string
          seat_id: string
        }
        Update: {
          accepts?: boolean | null
          added_at?: string
          amendment_id?: string
          answered_at?: string | null
          role?: string
          seat_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "amendment_seats_amendment_id_fkey"
            columns: ["amendment_id"]
            isOneToOne: false
            referencedRelation: "amendments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amendment_seats_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "public_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amendment_seats_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
        ]
      }
      amendments: {
        Row: {
          action: Database["public"]["Enums"]["amendment_action"]
          based_on_version_id: string | null
          created_at: string
          decided_at: string | null
          id: string
          is_friendly: boolean
          paper_id: string
          parent_amendment_id: string | null
          proposed_by_seat_id: string | null
          queue_position: number | null
          ruling: string | null
          sequence: number
          status: Database["public"]["Enums"]["amendment_status"]
          target_clause_id: string | null
          target_part: string
          text_markdown: string | null
          updated_at: string
        }
        Insert: {
          action: Database["public"]["Enums"]["amendment_action"]
          based_on_version_id?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          is_friendly?: boolean
          paper_id: string
          parent_amendment_id?: string | null
          proposed_by_seat_id?: string | null
          queue_position?: number | null
          ruling?: string | null
          sequence: number
          status: Database["public"]["Enums"]["amendment_status"]
          target_clause_id?: string | null
          target_part: string
          text_markdown?: string | null
          updated_at?: string
        }
        Update: {
          action?: Database["public"]["Enums"]["amendment_action"]
          based_on_version_id?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          is_friendly?: boolean
          paper_id?: string
          parent_amendment_id?: string | null
          proposed_by_seat_id?: string | null
          queue_position?: number | null
          ruling?: string | null
          sequence?: number
          status?: Database["public"]["Enums"]["amendment_status"]
          target_clause_id?: string | null
          target_part?: string
          text_markdown?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "amendments_based_on_version_id_fkey"
            columns: ["based_on_version_id"]
            isOneToOne: false
            referencedRelation: "committee_paper_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amendments_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "committee_papers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amendments_parent_amendment_id_fkey"
            columns: ["parent_amendment_id"]
            isOneToOne: false
            referencedRelation: "amendments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amendments_proposed_by_seat_id_fkey"
            columns: ["proposed_by_seat_id"]
            isOneToOne: false
            referencedRelation: "public_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amendments_proposed_by_seat_id_fkey"
            columns: ["proposed_by_seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience: Database["public"]["Enums"]["audience"]
          author_id: string
          body: string
          committee_id: string | null
          conference_id: string
          created_at: string
          delegation_id: string | null
          id: string
          is_pinned: boolean
          published_at: string
          title: string
          updated_at: string
        }
        Insert: {
          audience?: Database["public"]["Enums"]["audience"]
          author_id: string
          body: string
          committee_id?: string | null
          conference_id: string
          created_at?: string
          delegation_id?: string | null
          id?: string
          is_pinned?: boolean
          published_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          audience?: Database["public"]["Enums"]["audience"]
          author_id?: string
          body?: string
          committee_id?: string | null
          conference_id?: string
          created_at?: string
          delegation_id?: string | null
          id?: string
          is_pinned?: boolean
          published_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "committees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences_with_organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "delegations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "delegations_with_heads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "participant_delegations"
            referencedColumns: ["id"]
          },
        ]
      }
      application_internal_notes: {
        Row: {
          application_id: string
          note: string | null
          updated_at: string
        }
        Insert: {
          application_id: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_internal_notes_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_internal_notes_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications_with_applicant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_internal_notes_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "staff_application_deciders"
            referencedColumns: ["application_id"]
          },
        ]
      }
      application_questions: {
        Row: {
          conference_id: string
          created_at: string
          help_text: string | null
          id: string
          is_required: boolean
          label: string
          options: string[]
          position: number
          type: Database["public"]["Enums"]["question_type"]
          updated_at: string
        }
        Insert: {
          conference_id: string
          created_at?: string
          help_text?: string | null
          id?: string
          is_required?: boolean
          label: string
          options?: string[]
          position?: number
          type: Database["public"]["Enums"]["question_type"]
          updated_at?: string
        }
        Update: {
          conference_id?: string
          created_at?: string
          help_text?: string | null
          id?: string
          is_required?: boolean
          label?: string
          options?: string[]
          position?: number
          type?: Database["public"]["Enums"]["question_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_questions_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_questions_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences_with_organization"
            referencedColumns: ["id"]
          },
        ]
      }
      application_team_code_attempts: {
        Row: {
          attempted_at: string
          id: number
          user_id: string
        }
        Insert: {
          attempted_at?: string
          id?: never
          user_id: string
        }
        Update: {
          attempted_at?: string
          id?: never
          user_id?: string
        }
        Relationships: []
      }
      application_teams: {
        Row: {
          conference_id: string
          created_at: string
          id: string
          join_code: string
        }
        Insert: {
          conference_id: string
          created_at?: string
          id?: string
          join_code: string
        }
        Update: {
          conference_id?: string
          created_at?: string
          id?: string
          join_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_teams_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_teams_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences_with_organization"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          answers: Json
          committee_preferences: string[]
          conference_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          internal_note: string | null
          motivation: string | null
          seat_preferences: string | null
          status: Database["public"]["Enums"]["application_status"]
          submitted_at: string | null
          team_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          answers?: Json
          committee_preferences?: string[]
          conference_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          internal_note?: string | null
          motivation?: string | null
          seat_preferences?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          submitted_at?: string | null
          team_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          answers?: Json
          committee_preferences?: string[]
          conference_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          internal_note?: string | null
          motivation?: string | null
          seat_preferences?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          submitted_at?: string | null
          team_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences_with_organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "application_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      awards: {
        Row: {
          committee_id: string
          created_at: string
          created_by: string
          id: string
          kind: Database["public"]["Enums"]["award_kind"]
          seat_id: string
          status: Database["public"]["Enums"]["award_status"]
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          committee_id: string
          created_at?: string
          created_by?: string
          id?: string
          kind: Database["public"]["Enums"]["award_kind"]
          seat_id: string
          status?: Database["public"]["Enums"]["award_status"]
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          committee_id?: string
          created_at?: string
          created_by?: string
          id?: string
          kind?: Database["public"]["Enums"]["award_kind"]
          seat_id?: string
          status?: Database["public"]["Enums"]["award_status"]
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "awards_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "committees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awards_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "public_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "awards_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
        ]
      }
      chair_notes: {
        Row: {
          author_id: string
          body: string
          committee_id: string
          created_at: string
          id: string
          seat_id: string
        }
        Insert: {
          author_id?: string
          body: string
          committee_id: string
          created_at?: string
          id?: string
          seat_id: string
        }
        Update: {
          author_id?: string
          body?: string
          committee_id?: string
          created_at?: string
          id?: string
          seat_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chair_notes_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "committees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chair_notes_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "public_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chair_notes_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
        ]
      }
      committee_chairs: {
        Row: {
          committee_id: string
          created_at: string
          title: string
          user_id: string
        }
        Insert: {
          committee_id: string
          created_at?: string
          title?: string
          user_id: string
        }
        Update: {
          committee_id?: string
          created_at?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "committee_chairs_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "committees"
            referencedColumns: ["id"]
          },
        ]
      }
      committee_paper_documents: {
        Row: {
          document_state: string
          paper_id: string
          updated_at: string
        }
        Insert: {
          document_state: string
          paper_id: string
          updated_at?: string
        }
        Update: {
          document_state?: string
          paper_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "committee_paper_documents_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: true
            referencedRelation: "committee_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      committee_paper_seats: {
        Row: {
          added_at: string
          added_by: string | null
          paper_id: string
          role: Database["public"]["Enums"]["paper_seat_role"]
          seat_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          paper_id: string
          role: Database["public"]["Enums"]["paper_seat_role"]
          seat_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          paper_id?: string
          role?: Database["public"]["Enums"]["paper_seat_role"]
          seat_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "committee_paper_seats_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "committee_papers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_paper_seats_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "public_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_paper_seats_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
        ]
      }
      committee_paper_sources: {
        Row: {
          paper_id: string
          source_paper_id: string
        }
        Insert: {
          paper_id: string
          source_paper_id: string
        }
        Update: {
          paper_id?: string
          source_paper_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "committee_paper_sources_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "committee_papers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_paper_sources_source_paper_id_fkey"
            columns: ["source_paper_id"]
            isOneToOne: false
            referencedRelation: "committee_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      committee_paper_versions: {
        Row: {
          amendment_id: string | null
          content: Json
          created_at: string
          id: string
          paper_id: string
          version_number: number
        }
        Insert: {
          amendment_id?: string | null
          content: Json
          created_at?: string
          id?: string
          paper_id: string
          version_number: number
        }
        Update: {
          amendment_id?: string | null
          content?: Json
          created_at?: string
          id?: string
          paper_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "committee_paper_versions_amendment_id_fkey"
            columns: ["amendment_id"]
            isOneToOne: false
            referencedRelation: "amendments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_paper_versions_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "committee_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      committee_papers: {
        Row: {
          answer_markdown: string | null
          body_markdown: string | null
          committee_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          introduced_at: string | null
          introduced_by_motion_id: string | null
          is_open_for_signatures: boolean
          kind: Database["public"]["Enums"]["paper_kind"]
          lead_seat_id: string | null
          live_epoch: number
          operative_markdown: string | null
          preamble_markdown: string | null
          return_comment: string | null
          revision: number
          sequence: number | null
          signatures_opened_at: string | null
          started_by_seat_id: string | null
          status: Database["public"]["Enums"]["paper_status"]
          submitted_at: string | null
          title: string
          topic: string | null
          topic_number: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          answer_markdown?: string | null
          body_markdown?: string | null
          committee_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          introduced_at?: string | null
          introduced_by_motion_id?: string | null
          is_open_for_signatures?: boolean
          kind: Database["public"]["Enums"]["paper_kind"]
          lead_seat_id?: string | null
          live_epoch?: number
          operative_markdown?: string | null
          preamble_markdown?: string | null
          return_comment?: string | null
          revision?: number
          sequence?: number | null
          signatures_opened_at?: string | null
          started_by_seat_id?: string | null
          status?: Database["public"]["Enums"]["paper_status"]
          submitted_at?: string | null
          title: string
          topic?: string | null
          topic_number?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          answer_markdown?: string | null
          body_markdown?: string | null
          committee_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          introduced_at?: string | null
          introduced_by_motion_id?: string | null
          is_open_for_signatures?: boolean
          kind?: Database["public"]["Enums"]["paper_kind"]
          lead_seat_id?: string | null
          live_epoch?: number
          operative_markdown?: string | null
          preamble_markdown?: string | null
          return_comment?: string | null
          revision?: number
          sequence?: number | null
          signatures_opened_at?: string | null
          started_by_seat_id?: string | null
          status?: Database["public"]["Enums"]["paper_status"]
          submitted_at?: string | null
          title?: string
          topic?: string | null
          topic_number?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "committee_papers_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "committees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_papers_introduced_by_motion_id_fkey"
            columns: ["introduced_by_motion_id"]
            isOneToOne: false
            referencedRelation: "motions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_papers_lead_seat_id_fkey"
            columns: ["lead_seat_id"]
            isOneToOne: false
            referencedRelation: "public_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_papers_lead_seat_id_fkey"
            columns: ["lead_seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_papers_started_by_seat_id_fkey"
            columns: ["started_by_seat_id"]
            isOneToOne: false
            referencedRelation: "public_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_papers_started_by_seat_id_fkey"
            columns: ["started_by_seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
        ]
      }
      committee_session_notes: {
        Row: {
          body: string
          committee_id: string
          revision: number
          session_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body?: string
          committee_id: string
          revision?: number
          session_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          committee_id?: string
          revision?: number
          session_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "committee_session_notes_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "committees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_session_notes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "committee_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      committee_sessions: {
        Row: {
          committee_id: string
          created_at: string
          ended_at: string | null
          id: string
          name: string
          started_at: string | null
          status: Database["public"]["Enums"]["session_status"]
          updated_at: string
        }
        Insert: {
          committee_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          name: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          updated_at?: string
        }
        Update: {
          committee_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          name?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "committee_sessions_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "committees"
            referencedColumns: ["id"]
          },
        ]
      }
      committee_state: {
        Row: {
          active_speakers_list_id: string | null
          agenda_topic: string | null
          caucus_ends_at: string | null
          caucus_paused_remaining_seconds: number | null
          caucus_total_seconds: number | null
          committee_id: string
          crisis_update: string | null
          crisis_update_at: string | null
          current_motion_id: string | null
          current_session_id: string | null
          current_speaker_entry_id: string | null
          current_vote_id: string | null
          displayed_clause: number | null
          displayed_paper_id: string | null
          mode: Database["public"]["Enums"]["committee_mode"]
          mode_before_suspension:
            | Database["public"]["Enums"]["committee_mode"]
            | null
          suspended_at: string | null
          suspended_until: string | null
          timer_ends_at: string | null
          timer_paused_remaining_seconds: number | null
          timer_total_seconds: number | null
          updated_at: string
        }
        Insert: {
          active_speakers_list_id?: string | null
          agenda_topic?: string | null
          caucus_ends_at?: string | null
          caucus_paused_remaining_seconds?: number | null
          caucus_total_seconds?: number | null
          committee_id: string
          crisis_update?: string | null
          crisis_update_at?: string | null
          current_motion_id?: string | null
          current_session_id?: string | null
          current_speaker_entry_id?: string | null
          current_vote_id?: string | null
          displayed_clause?: number | null
          displayed_paper_id?: string | null
          mode?: Database["public"]["Enums"]["committee_mode"]
          mode_before_suspension?:
            | Database["public"]["Enums"]["committee_mode"]
            | null
          suspended_at?: string | null
          suspended_until?: string | null
          timer_ends_at?: string | null
          timer_paused_remaining_seconds?: number | null
          timer_total_seconds?: number | null
          updated_at?: string
        }
        Update: {
          active_speakers_list_id?: string | null
          agenda_topic?: string | null
          caucus_ends_at?: string | null
          caucus_paused_remaining_seconds?: number | null
          caucus_total_seconds?: number | null
          committee_id?: string
          crisis_update?: string | null
          crisis_update_at?: string | null
          current_motion_id?: string | null
          current_session_id?: string | null
          current_speaker_entry_id?: string | null
          current_vote_id?: string | null
          displayed_clause?: number | null
          displayed_paper_id?: string | null
          mode?: Database["public"]["Enums"]["committee_mode"]
          mode_before_suspension?:
            | Database["public"]["Enums"]["committee_mode"]
            | null
          suspended_at?: string | null
          suspended_until?: string | null
          timer_ends_at?: string | null
          timer_paused_remaining_seconds?: number | null
          timer_total_seconds?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "committee_state_active_speakers_list_id_fkey"
            columns: ["active_speakers_list_id"]
            isOneToOne: false
            referencedRelation: "speakers_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_state_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: true
            referencedRelation: "committees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_state_current_motion_id_fkey"
            columns: ["current_motion_id"]
            isOneToOne: false
            referencedRelation: "motions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_state_current_session_id_fkey"
            columns: ["current_session_id"]
            isOneToOne: false
            referencedRelation: "committee_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_state_current_speaker_entry_id_fkey"
            columns: ["current_speaker_entry_id"]
            isOneToOne: false
            referencedRelation: "speakers_list_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_state_current_vote_id_fkey"
            columns: ["current_vote_id"]
            isOneToOne: false
            referencedRelation: "votes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_state_displayed_paper_id_fkey"
            columns: ["displayed_paper_id"]
            isOneToOne: false
            referencedRelation: "committee_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      committees: {
        Row: {
          abbreviation: string | null
          amendment_support_minimum: number
          amendment_support_unit: Database["public"]["Enums"]["support_unit"]
          checks_format: boolean
          conference_id: string
          created_at: string
          crisis_allows_resolutions: boolean
          default_speaking_time_seconds: number
          description: string | null
          format: Database["public"]["Enums"]["committee_format"]
          has_friendly_amendments: boolean
          has_second_degree_amendments: boolean
          has_working_papers: boolean
          id: string
          level: Database["public"]["Enums"]["experience_level"]
          name: string
          one_sponsorship_per_topic: boolean
          paper_words: Database["public"]["Enums"]["paper_words"]
          planned_seat_count: number | null
          position: number
          preamble_amendable: boolean
          room: string | null
          slug: string
          sponsor_limit: number | null
          support_counts_sponsors: boolean
          support_minimum: number
          support_unit: Database["public"]["Enums"]["support_unit"]
          topics: string[]
          updated_at: string
        }
        Insert: {
          abbreviation?: string | null
          amendment_support_minimum?: number
          amendment_support_unit?: Database["public"]["Enums"]["support_unit"]
          checks_format?: boolean
          conference_id: string
          created_at?: string
          crisis_allows_resolutions?: boolean
          default_speaking_time_seconds?: number
          description?: string | null
          format?: Database["public"]["Enums"]["committee_format"]
          has_friendly_amendments?: boolean
          has_second_degree_amendments?: boolean
          has_working_papers?: boolean
          id?: string
          level?: Database["public"]["Enums"]["experience_level"]
          name: string
          one_sponsorship_per_topic?: boolean
          paper_words?: Database["public"]["Enums"]["paper_words"]
          planned_seat_count?: number | null
          position?: number
          preamble_amendable?: boolean
          room?: string | null
          slug: string
          sponsor_limit?: number | null
          support_counts_sponsors?: boolean
          support_minimum?: number
          support_unit?: Database["public"]["Enums"]["support_unit"]
          topics?: string[]
          updated_at?: string
        }
        Update: {
          abbreviation?: string | null
          amendment_support_minimum?: number
          amendment_support_unit?: Database["public"]["Enums"]["support_unit"]
          checks_format?: boolean
          conference_id?: string
          created_at?: string
          crisis_allows_resolutions?: boolean
          default_speaking_time_seconds?: number
          description?: string | null
          format?: Database["public"]["Enums"]["committee_format"]
          has_friendly_amendments?: boolean
          has_second_degree_amendments?: boolean
          has_working_papers?: boolean
          id?: string
          level?: Database["public"]["Enums"]["experience_level"]
          name?: string
          one_sponsorship_per_topic?: boolean
          paper_words?: Database["public"]["Enums"]["paper_words"]
          planned_seat_count?: number | null
          position?: number
          preamble_amendable?: boolean
          room?: string | null
          slug?: string
          sponsor_limit?: number | null
          support_counts_sponsors?: boolean
          support_minimum?: number
          support_unit?: Database["public"]["Enums"]["support_unit"]
          topics?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "committees_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committees_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences_with_organization"
            referencedColumns: ["id"]
          },
        ]
      }
      conference_role_members: {
        Row: {
          conference_id: string
          created_at: string
          granted_by: string | null
          role_id: string
          user_id: string
        }
        Insert: {
          conference_id: string
          created_at?: string
          granted_by?: string | null
          role_id: string
          user_id: string
        }
        Update: {
          conference_id?: string
          created_at?: string
          granted_by?: string | null
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conference_role_members_conference_id_user_id_fkey"
            columns: ["conference_id", "user_id"]
            isOneToOne: false
            referencedRelation: "conference_staff"
            referencedColumns: ["conference_id", "user_id"]
          },
          {
            foreignKeyName: "conference_role_members_role_conference_fkey"
            columns: ["role_id", "conference_id"]
            isOneToOne: false
            referencedRelation: "conference_roles"
            referencedColumns: ["id", "conference_id"]
          },
        ]
      }
      conference_roles: {
        Row: {
          conference_id: string
          created_at: string
          id: string
          is_public: boolean
          name: string
          permissions: Database["public"]["Enums"]["permission"][]
          position: number
          scope: Database["public"]["Enums"]["role_scope"]
          updated_at: string
        }
        Insert: {
          conference_id: string
          created_at?: string
          id?: string
          is_public?: boolean
          name: string
          permissions?: Database["public"]["Enums"]["permission"][]
          position?: number
          scope?: Database["public"]["Enums"]["role_scope"]
          updated_at?: string
        }
        Update: {
          conference_id?: string
          created_at?: string
          id?: string
          is_public?: boolean
          name?: string
          permissions?: Database["public"]["Enums"]["permission"][]
          position?: number
          scope?: Database["public"]["Enums"]["role_scope"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conference_roles_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conference_roles_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences_with_organization"
            referencedColumns: ["id"]
          },
        ]
      }
      conference_staff: {
        Row: {
          conference_id: string
          created_at: string
          title: string | null
          user_id: string
        }
        Insert: {
          conference_id: string
          created_at?: string
          title?: string | null
          user_id: string
        }
        Update: {
          conference_id?: string
          created_at?: string
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conference_staff_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conference_staff_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences_with_organization"
            referencedColumns: ["id"]
          },
        ]
      }
      conferences: {
        Row: {
          accepts_delegations: boolean
          accepts_individual_applications: boolean
          application_close_offset_days: number
          application_close_rule: Database["public"]["Enums"]["application_close_rule"]
          application_open_mode: Database["public"]["Enums"]["application_open_mode"]
          applications_close_at: string | null
          applications_open_at: string | null
          ask_motivation: boolean
          awards_published_at: string | null
          banner_path: string | null
          city: string | null
          collects_payments_manually: boolean
          committee_preference_count: number
          conference_time_status: Database["public"]["Enums"]["known_or_tba"]
          contact_email: string | null
          contact_phone: string | null
          country_code: string | null
          created_at: string
          created_by: string | null
          creation_step: Database["public"]["Enums"]["creation_step"]
          currency: string
          description: string | null
          end_date: string
          end_time: string | null
          expected_delegates: number | null
          facebook_url: string | null
          fee_status: Database["public"]["Enums"]["fee_status"]
          first_published_at: string | null
          id: string
          instagram_url: string | null
          kind: Database["public"]["Enums"]["conference_kind"]
          language: string
          level: Database["public"]["Enums"]["conference_level"]
          linkedin_url: string | null
          location_mode: Database["public"]["Enums"]["location_mode"]
          logo_path: string | null
          max_age: number | null
          min_age: number | null
          name: string
          organization_id: string
          payment_instructions: string | null
          position_paper_deadline: string | null
          position_paper_required: boolean
          prefill_sources: Json
          show_schedule_publicly: boolean
          slug: string
          start_date: string
          start_time: string | null
          status: Database["public"]["Enums"]["conference_status"]
          tagline: string | null
          tiktok_url: string | null
          timezone: string
          updated_at: string
          venue_address: string | null
          venue_name: string | null
          venue_status: Database["public"]["Enums"]["known_or_tba"]
          website_url: string | null
          youtube_url: string | null
        }
        Insert: {
          accepts_delegations?: boolean
          accepts_individual_applications?: boolean
          application_close_offset_days?: number
          application_close_rule?: Database["public"]["Enums"]["application_close_rule"]
          application_open_mode?: Database["public"]["Enums"]["application_open_mode"]
          applications_close_at?: string | null
          applications_open_at?: string | null
          ask_motivation?: boolean
          awards_published_at?: string | null
          banner_path?: string | null
          city?: string | null
          collects_payments_manually?: boolean
          committee_preference_count?: number
          conference_time_status?: Database["public"]["Enums"]["known_or_tba"]
          contact_email?: string | null
          contact_phone?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          creation_step?: Database["public"]["Enums"]["creation_step"]
          currency?: string
          description?: string | null
          end_date: string
          end_time?: string | null
          expected_delegates?: number | null
          facebook_url?: string | null
          fee_status?: Database["public"]["Enums"]["fee_status"]
          first_published_at?: string | null
          id?: string
          instagram_url?: string | null
          kind?: Database["public"]["Enums"]["conference_kind"]
          language?: string
          level?: Database["public"]["Enums"]["conference_level"]
          linkedin_url?: string | null
          location_mode?: Database["public"]["Enums"]["location_mode"]
          logo_path?: string | null
          max_age?: number | null
          min_age?: number | null
          name: string
          organization_id: string
          payment_instructions?: string | null
          position_paper_deadline?: string | null
          position_paper_required?: boolean
          prefill_sources?: Json
          show_schedule_publicly?: boolean
          slug: string
          start_date: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["conference_status"]
          tagline?: string | null
          tiktok_url?: string | null
          timezone?: string
          updated_at?: string
          venue_address?: string | null
          venue_name?: string | null
          venue_status?: Database["public"]["Enums"]["known_or_tba"]
          website_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          accepts_delegations?: boolean
          accepts_individual_applications?: boolean
          application_close_offset_days?: number
          application_close_rule?: Database["public"]["Enums"]["application_close_rule"]
          application_open_mode?: Database["public"]["Enums"]["application_open_mode"]
          applications_close_at?: string | null
          applications_open_at?: string | null
          ask_motivation?: boolean
          awards_published_at?: string | null
          banner_path?: string | null
          city?: string | null
          collects_payments_manually?: boolean
          committee_preference_count?: number
          conference_time_status?: Database["public"]["Enums"]["known_or_tba"]
          contact_email?: string | null
          contact_phone?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          creation_step?: Database["public"]["Enums"]["creation_step"]
          currency?: string
          description?: string | null
          end_date?: string
          end_time?: string | null
          expected_delegates?: number | null
          facebook_url?: string | null
          fee_status?: Database["public"]["Enums"]["fee_status"]
          first_published_at?: string | null
          id?: string
          instagram_url?: string | null
          kind?: Database["public"]["Enums"]["conference_kind"]
          language?: string
          level?: Database["public"]["Enums"]["conference_level"]
          linkedin_url?: string | null
          location_mode?: Database["public"]["Enums"]["location_mode"]
          logo_path?: string | null
          max_age?: number | null
          min_age?: number | null
          name?: string
          organization_id?: string
          payment_instructions?: string | null
          position_paper_deadline?: string | null
          position_paper_required?: boolean
          prefill_sources?: Json
          show_schedule_publicly?: boolean
          slug?: string
          start_date?: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["conference_status"]
          tagline?: string | null
          tiktok_url?: string | null
          timezone?: string
          updated_at?: string
          venue_address?: string | null
          venue_name?: string | null
          venue_status?: Database["public"]["Enums"]["known_or_tba"]
          website_url?: string | null
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization_private_settings"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "conferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      delegation_code_attempts: {
        Row: {
          attempted_at: string
          id: number
          user_id: string
        }
        Insert: {
          attempted_at?: string
          id?: never
          user_id: string
        }
        Update: {
          attempted_at?: string
          id?: never
          user_id?: string
        }
        Relationships: []
      }
      delegation_internal_notes: {
        Row: {
          delegation_id: string
          note: string | null
          updated_at: string
        }
        Insert: {
          delegation_id: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          delegation_id?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delegation_internal_notes_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: true
            referencedRelation: "delegations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegation_internal_notes_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: true
            referencedRelation: "delegations_with_heads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegation_internal_notes_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: true
            referencedRelation: "participant_delegations"
            referencedColumns: ["id"]
          },
        ]
      }
      delegation_members: {
        Row: {
          delegation_id: string
          joined_at: string
          role: Database["public"]["Enums"]["delegation_role"]
          user_id: string
        }
        Insert: {
          delegation_id: string
          joined_at?: string
          role?: Database["public"]["Enums"]["delegation_role"]
          user_id: string
        }
        Update: {
          delegation_id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["delegation_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delegation_members_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "delegations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegation_members_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "delegations_with_heads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegation_members_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "participant_delegations"
            referencedColumns: ["id"]
          },
        ]
      }
      delegations: {
        Row: {
          conference_id: string
          country_code: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          institution_name: string
          internal_note: string | null
          join_code: string
          name: string
          note: string | null
          requested_seats: number
          status: Database["public"]["Enums"]["delegation_status"]
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          conference_id: string
          country_code?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          institution_name: string
          internal_note?: string | null
          join_code: string
          name: string
          note?: string | null
          requested_seats?: number
          status?: Database["public"]["Enums"]["delegation_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          conference_id?: string
          country_code?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          institution_name?: string
          internal_note?: string | null
          join_code?: string
          name?: string
          note?: string | null
          requested_seats?: number
          status?: Database["public"]["Enums"]["delegation_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delegations_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegations_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences_with_organization"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          audience: Database["public"]["Enums"]["audience"]
          body_markdown: string | null
          committee_id: string | null
          conference_id: string
          created_at: string
          file_name: string | null
          file_size_bytes: number | null
          id: string
          kind: Database["public"]["Enums"]["document_kind"]
          mime_type: string | null
          review_comment: string | null
          review_status: Database["public"]["Enums"]["review_status"] | null
          reviewed_at: string | null
          reviewed_by: string | null
          seat_id: string | null
          storage_path: string | null
          title: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          audience?: Database["public"]["Enums"]["audience"]
          body_markdown?: string | null
          committee_id?: string | null
          conference_id: string
          created_at?: string
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          kind: Database["public"]["Enums"]["document_kind"]
          mime_type?: string | null
          review_comment?: string | null
          review_status?: Database["public"]["Enums"]["review_status"] | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          seat_id?: string | null
          storage_path?: string | null
          title: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          audience?: Database["public"]["Enums"]["audience"]
          body_markdown?: string | null
          committee_id?: string | null
          conference_id?: string
          created_at?: string
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["document_kind"]
          mime_type?: string | null
          review_comment?: string | null
          review_status?: Database["public"]["Enums"]["review_status"] | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          seat_id?: string | null
          storage_path?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "committees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences_with_organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "public_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
        ]
      }
      fees: {
        Row: {
          amount_cents: number
          applies_to: Database["public"]["Enums"]["fee_applies_to"]
          conference_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          position: number
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          amount_cents: number
          applies_to?: Database["public"]["Enums"]["fee_applies_to"]
          conference_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          position?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          amount_cents?: number
          applies_to?: Database["public"]["Enums"]["fee_applies_to"]
          conference_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          position?: number
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fees_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fees_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences_with_organization"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_sends: {
        Row: {
          id: string
          invited_by: string
          sent_at: string
        }
        Insert: {
          id?: string
          invited_by: string
          sent_at?: string
        }
        Update: {
          id?: string
          invited_by?: string
          sent_at?: string
        }
        Relationships: []
      }
      invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          committee_id: string | null
          conference_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          kind: Database["public"]["Enums"]["invite_kind"]
          organization_id: string | null
          role: string | null
          role_id: string | null
          title: string | null
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          committee_id?: string | null
          conference_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          kind: Database["public"]["Enums"]["invite_kind"]
          organization_id?: string | null
          role?: string | null
          role_id?: string | null
          title?: string | null
          token: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          committee_id?: string | null
          conference_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          kind?: Database["public"]["Enums"]["invite_kind"]
          organization_id?: string | null
          role?: string | null
          role_id?: string | null
          title?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "committees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences_with_organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization_private_settings"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "invites_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_role_conference_fkey"
            columns: ["role_id", "conference_id"]
            isOneToOne: false
            referencedRelation: "conference_roles"
            referencedColumns: ["id", "conference_id"]
          },
        ]
      }
      invoice_internal_notes: {
        Row: {
          created_at: string
          invoice_id: string
          note: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          invoice_id: string
          note: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          invoice_id?: string
          note?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_internal_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_cents: number
          conference_id: string
          created_at: string
          currency: string
          delegation_id: string | null
          description: string
          due_at: string | null
          fee_id: string | null
          id: string
          number: string
          paid_at: string | null
          paid_method: string | null
          payer_user_id: string | null
          platform_fee_cents: number
          quantity: number
          seat_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          stripe_refund_id: string | null
          unit_amount_cents: number
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          conference_id: string
          created_at?: string
          currency: string
          delegation_id?: string | null
          description: string
          due_at?: string | null
          fee_id?: string | null
          id?: string
          number: string
          paid_at?: string | null
          paid_method?: string | null
          payer_user_id?: string | null
          platform_fee_cents?: number
          quantity?: number
          seat_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          unit_amount_cents: number
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          conference_id?: string
          created_at?: string
          currency?: string
          delegation_id?: string | null
          description?: string
          due_at?: string | null
          fee_id?: string | null
          id?: string
          number?: string
          paid_at?: string | null
          paid_method?: string | null
          payer_user_id?: string | null
          platform_fee_cents?: number
          quantity?: number
          seat_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          unit_amount_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences_with_organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "delegations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "delegations_with_heads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "participant_delegations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_fee_id_fkey"
            columns: ["fee_id"]
            isOneToOne: false
            referencedRelation: "fees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "public_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
        ]
      }
      motions: {
        Row: {
          committee_id: string
          created_at: string
          decided_at: string | null
          id: string
          kind: Database["public"]["Enums"]["motion_kind"]
          paper_id: string | null
          proposed_by_seat_id: string | null
          session_id: string
          speaking_time_seconds: number | null
          started_without_vote: boolean
          status: Database["public"]["Enums"]["motion_status"]
          topic: string | null
          total_time_seconds: number | null
          votes_against: number | null
          votes_for: number | null
        }
        Insert: {
          committee_id: string
          created_at?: string
          decided_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["motion_kind"]
          paper_id?: string | null
          proposed_by_seat_id?: string | null
          session_id: string
          speaking_time_seconds?: number | null
          started_without_vote?: boolean
          status?: Database["public"]["Enums"]["motion_status"]
          topic?: string | null
          total_time_seconds?: number | null
          votes_against?: number | null
          votes_for?: number | null
        }
        Update: {
          committee_id?: string
          created_at?: string
          decided_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["motion_kind"]
          paper_id?: string | null
          proposed_by_seat_id?: string | null
          session_id?: string
          speaking_time_seconds?: number | null
          started_without_vote?: boolean
          status?: Database["public"]["Enums"]["motion_status"]
          topic?: string | null
          total_time_seconds?: number | null
          votes_against?: number | null
          votes_for?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "motions_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "committees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motions_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "committee_papers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motions_proposed_by_seat_id_fkey"
            columns: ["proposed_by_seat_id"]
            isOneToOne: false
            referencedRelation: "public_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motions_proposed_by_seat_id_fkey"
            columns: ["proposed_by_seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "committee_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          conference_id: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          link_path: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          conference_id?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          link_path?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          conference_id?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          link_path?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences_with_organization"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          organization_id: string
          role: Database["public"]["Enums"]["organization_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          role?: Database["public"]["Enums"]["organization_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["organization_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization_private_settings"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          city: string | null
          country_code: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_personal: boolean
          logo_path: string | null
          name: string
          slug: string
          stripe_account_id: string | null
          stripe_onboarding_completed_at: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          city?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_personal?: boolean
          logo_path?: string | null
          name: string
          slug: string
          stripe_account_id?: string | null
          stripe_onboarding_completed_at?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          city?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_personal?: boolean
          logo_path?: string | null
          name?: string
          slug?: string
          stripe_account_id?: string | null
          stripe_onboarding_completed_at?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      orphaned_document_files: {
        Row: {
          orphaned_at: string
          storage_path: string
        }
        Insert: {
          orphaned_at?: string
          storage_path: string
        }
        Update: {
          orphaned_at?: string
          storage_path?: string
        }
        Relationships: []
      }
      paper_author_notices: {
        Row: {
          added_seat_id: string
          adder_seat_id: string
          sent_at: string
        }
        Insert: {
          added_seat_id: string
          adder_seat_id: string
          sent_at?: string
        }
        Update: {
          added_seat_id?: string
          adder_seat_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_author_notices_added_seat_id_fkey"
            columns: ["added_seat_id"]
            isOneToOne: false
            referencedRelation: "public_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_author_notices_added_seat_id_fkey"
            columns: ["added_seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_author_notices_adder_seat_id_fkey"
            columns: ["adder_seat_id"]
            isOneToOne: false
            referencedRelation: "public_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_author_notices_adder_seat_id_fkey"
            columns: ["adder_seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_comment_threads: {
        Row: {
          anchor_end: string | null
          anchor_fragment: string
          anchor_start: string | null
          committee_paper_id: string | null
          created_at: string
          id: string
          is_from_dais: boolean
          position_paper_seat_id: string | null
          quoted_text: string | null
          resolved_at: string | null
          resolved_by: string | null
          started_by: string | null
          started_by_seat_id: string | null
          suggestion_id: string | null
        }
        Insert: {
          anchor_end?: string | null
          anchor_fragment?: string
          anchor_start?: string | null
          committee_paper_id?: string | null
          created_at?: string
          id?: string
          is_from_dais?: boolean
          position_paper_seat_id?: string | null
          quoted_text?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          started_by?: string | null
          started_by_seat_id?: string | null
          suggestion_id?: string | null
        }
        Update: {
          anchor_end?: string | null
          anchor_fragment?: string
          anchor_start?: string | null
          committee_paper_id?: string | null
          created_at?: string
          id?: string
          is_from_dais?: boolean
          position_paper_seat_id?: string | null
          quoted_text?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          started_by?: string | null
          started_by_seat_id?: string | null
          suggestion_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paper_comment_threads_committee_paper_id_fkey"
            columns: ["committee_paper_id"]
            isOneToOne: false
            referencedRelation: "committee_papers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_comment_threads_position_paper_seat_id_fkey"
            columns: ["position_paper_seat_id"]
            isOneToOne: false
            referencedRelation: "public_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_comment_threads_position_paper_seat_id_fkey"
            columns: ["position_paper_seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_comment_threads_started_by_seat_id_fkey"
            columns: ["started_by_seat_id"]
            isOneToOne: false
            referencedRelation: "public_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_comment_threads_started_by_seat_id_fkey"
            columns: ["started_by_seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_comments: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          thread_id: string
          written_by: string | null
        }
        Insert: {
          body: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          thread_id: string
          written_by?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          thread_id?: string
          written_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paper_comments_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "paper_comment_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_thread_notices: {
        Row: {
          paper_id: string
          sent_at: string
          started_by: string
        }
        Insert: {
          paper_id: string
          sent_at?: string
          started_by: string
        }
        Update: {
          paper_id?: string
          sent_at?: string
          started_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_thread_notices_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "committee_papers"
            referencedColumns: ["id"]
          },
        ]
      }
      position_paper_drafts: {
        Row: {
          body_markdown: string
          document_state: string | null
          revision: number
          seat_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body_markdown?: string
          document_state?: string | null
          revision?: number
          seat_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body_markdown?: string
          document_state?: string | null
          revision?: number
          seat_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "position_paper_drafts_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: true
            referencedRelation: "public_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_paper_drafts_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: true
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_details: {
        Row: {
          created_at: string
          date_of_birth: string | null
          dietary_requirements: string | null
          email: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          dietary_requirements?: string | null
          email: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          dietary_requirements?: string | null
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_path: string | null
          bio: string | null
          country_code: string | null
          created_at: string
          experience_level: Database["public"]["Enums"]["experience_level"]
          full_name: string
          id: string
          institution_name: string | null
          is_platform_admin: boolean
          onboarding_completed_at: string | null
          pronouns: string | null
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          bio?: string | null
          country_code?: string | null
          created_at?: string
          experience_level?: Database["public"]["Enums"]["experience_level"]
          full_name?: string
          id: string
          institution_name?: string | null
          is_platform_admin?: boolean
          onboarding_completed_at?: string | null
          pronouns?: string | null
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          bio?: string | null
          country_code?: string | null
          created_at?: string
          experience_level?: Database["public"]["Enums"]["experience_level"]
          full_name?: string
          id?: string
          institution_name?: string | null
          is_platform_admin?: boolean
          onboarding_completed_at?: string | null
          pronouns?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      public_media_cleanup: {
        Row: {
          path: string
          queued_at: string
        }
        Insert: {
          path: string
          queued_at?: string
        }
        Update: {
          path?: string
          queued_at?: string
        }
        Relationships: []
      }
      roll_call_entries: {
        Row: {
          created_at: string
          roll_call_id: string
          seat_id: string
          status: Database["public"]["Enums"]["attendance_status"]
        }
        Insert: {
          created_at?: string
          roll_call_id: string
          seat_id: string
          status: Database["public"]["Enums"]["attendance_status"]
        }
        Update: {
          created_at?: string
          roll_call_id?: string
          seat_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
        }
        Relationships: [
          {
            foreignKeyName: "roll_call_entries_roll_call_id_fkey"
            columns: ["roll_call_id"]
            isOneToOne: false
            referencedRelation: "roll_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roll_call_entries_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "public_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roll_call_entries_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
        ]
      }
      roll_calls: {
        Row: {
          id: string
          session_id: string
          taken_at: string
          taken_by: string
        }
        Insert: {
          id?: string
          session_id: string
          taken_at?: string
          taken_by?: string
        }
        Update: {
          id?: string
          session_id?: string
          taken_at?: string
          taken_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "roll_calls_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "committee_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_events: {
        Row: {
          audience: Database["public"]["Enums"]["audience"]
          committee_id: string | null
          conference_id: string
          created_at: string
          description: string | null
          ends_at: string
          id: string
          last_notified_at: string | null
          location: string | null
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          audience?: Database["public"]["Enums"]["audience"]
          committee_id?: string | null
          conference_id: string
          created_at?: string
          description?: string | null
          ends_at: string
          id?: string
          last_notified_at?: string | null
          location?: string | null
          starts_at: string
          title: string
          updated_at?: string
        }
        Update: {
          audience?: Database["public"]["Enums"]["audience"]
          committee_id?: string | null
          conference_id?: string
          created_at?: string
          description?: string | null
          ends_at?: string
          id?: string
          last_notified_at?: string | null
          location?: string | null
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_events_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "committees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_events_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_events_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences_with_organization"
            referencedColumns: ["id"]
          },
        ]
      }
      seats: {
        Row: {
          allocated_at: string | null
          application_id: string | null
          committee_id: string
          country_code: string | null
          created_at: string
          delegation_id: string | null
          id: string
          is_available: boolean
          kind: Database["public"]["Enums"]["seat_kind"]
          name: string
          position: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          allocated_at?: string | null
          application_id?: string | null
          committee_id: string
          country_code?: string | null
          created_at?: string
          delegation_id?: string | null
          id?: string
          is_available?: boolean
          kind?: Database["public"]["Enums"]["seat_kind"]
          name: string
          position?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          allocated_at?: string | null
          application_id?: string | null
          committee_id?: string
          country_code?: string | null
          created_at?: string
          delegation_id?: string | null
          id?: string
          is_available?: boolean
          kind?: Database["public"]["Enums"]["seat_kind"]
          name?: string
          position?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seats_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seats_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications_with_applicant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seats_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "staff_application_deciders"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "seats_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "committees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seats_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "delegations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seats_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "delegations_with_heads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seats_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "participant_delegations"
            referencedColumns: ["id"]
          },
        ]
      }
      speakers_list_entries: {
        Row: {
          created_at: string
          finished_at: string | null
          id: string
          position: number
          seat_id: string | null
          speaker_name: string | null
          speakers_list_id: string
          spoke_seconds: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["speaker_status"]
        }
        Insert: {
          created_at?: string
          finished_at?: string | null
          id?: string
          position?: number
          seat_id?: string | null
          speaker_name?: string | null
          speakers_list_id: string
          spoke_seconds?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["speaker_status"]
        }
        Update: {
          created_at?: string
          finished_at?: string | null
          id?: string
          position?: number
          seat_id?: string | null
          speaker_name?: string | null
          speakers_list_id?: string
          spoke_seconds?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["speaker_status"]
        }
        Relationships: [
          {
            foreignKeyName: "speakers_list_entries_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "public_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "speakers_list_entries_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "speakers_list_entries_speakers_list_id_fkey"
            columns: ["speakers_list_id"]
            isOneToOne: false
            referencedRelation: "speakers_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      speakers_lists: {
        Row: {
          committee_id: string
          created_at: string
          id: string
          is_open: boolean
          kind: Database["public"]["Enums"]["speakers_list_kind"]
          motion_id: string | null
          name: string
          purpose: string | null
          session_id: string
          speaking_time_seconds: number
        }
        Insert: {
          committee_id: string
          created_at?: string
          id?: string
          is_open?: boolean
          kind: Database["public"]["Enums"]["speakers_list_kind"]
          motion_id?: string | null
          name: string
          purpose?: string | null
          session_id: string
          speaking_time_seconds: number
        }
        Update: {
          committee_id?: string
          created_at?: string
          id?: string
          is_open?: boolean
          kind?: Database["public"]["Enums"]["speakers_list_kind"]
          motion_id?: string | null
          name?: string
          purpose?: string | null
          session_id?: string
          speaking_time_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "speakers_lists_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "committees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "speakers_lists_motion_id_fkey"
            columns: ["motion_id"]
            isOneToOne: false
            referencedRelation: "motions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "speakers_lists_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "committee_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      vote_entries: {
        Row: {
          choice: Database["public"]["Enums"]["vote_choice"]
          created_at: string
          seat_id: string
          vote_id: string
        }
        Insert: {
          choice: Database["public"]["Enums"]["vote_choice"]
          created_at?: string
          seat_id: string
          vote_id: string
        }
        Update: {
          choice?: Database["public"]["Enums"]["vote_choice"]
          created_at?: string
          seat_id?: string
          vote_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vote_entries_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "public_seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vote_entries_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "seats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vote_entries_vote_id_fkey"
            columns: ["vote_id"]
            isOneToOne: false
            referencedRelation: "votes"
            referencedColumns: ["id"]
          },
        ]
      }
      votes: {
        Row: {
          amendment_id: string | null
          closed_at: string | null
          committee_id: string
          id: string
          kind: Database["public"]["Enums"]["vote_kind"]
          majority: Database["public"]["Enums"]["majority_type"]
          method: Database["public"]["Enums"]["vote_method"]
          motion_id: string | null
          opened_at: string
          paper_id: string | null
          passed: boolean | null
          session_id: string
          status: Database["public"]["Enums"]["vote_status"]
          subject: string | null
          votes_abstain: number | null
          votes_against: number | null
          votes_for: number | null
        }
        Insert: {
          amendment_id?: string | null
          closed_at?: string | null
          committee_id: string
          id?: string
          kind: Database["public"]["Enums"]["vote_kind"]
          majority?: Database["public"]["Enums"]["majority_type"]
          method?: Database["public"]["Enums"]["vote_method"]
          motion_id?: string | null
          opened_at?: string
          paper_id?: string | null
          passed?: boolean | null
          session_id: string
          status?: Database["public"]["Enums"]["vote_status"]
          subject?: string | null
          votes_abstain?: number | null
          votes_against?: number | null
          votes_for?: number | null
        }
        Update: {
          amendment_id?: string | null
          closed_at?: string | null
          committee_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["vote_kind"]
          majority?: Database["public"]["Enums"]["majority_type"]
          method?: Database["public"]["Enums"]["vote_method"]
          motion_id?: string | null
          opened_at?: string
          paper_id?: string | null
          passed?: boolean | null
          session_id?: string
          status?: Database["public"]["Enums"]["vote_status"]
          subject?: string | null
          votes_abstain?: number | null
          votes_against?: number | null
          votes_for?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "votes_amendment_id_fkey"
            columns: ["amendment_id"]
            isOneToOne: false
            referencedRelation: "amendments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "committees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_motion_id_fkey"
            columns: ["motion_id"]
            isOneToOne: false
            referencedRelation: "motions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_paper_id_fkey"
            columns: ["paper_id"]
            isOneToOne: false
            referencedRelation: "committee_papers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "committee_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      applications_with_applicant: {
        Row: {
          answers: Json | null
          applicant_avatar_path: string | null
          applicant_country_code: string | null
          applicant_experience_level:
            | Database["public"]["Enums"]["experience_level"]
            | null
          applicant_institution_name: string | null
          applicant_name: string | null
          committee_preferences: string[] | null
          conference_id: string | null
          created_at: string | null
          decided_at: string | null
          decision_note: string | null
          id: string | null
          motivation: string | null
          seat_preferences: string | null
          status: Database["public"]["Enums"]["application_status"] | null
          submitted_at: string | null
          team_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences_with_organization"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "application_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      conferences_with_organization: {
        Row: {
          accepts_delegations: boolean | null
          accepts_individual_applications: boolean | null
          application_close_offset_days: number | null
          application_close_rule:
            | Database["public"]["Enums"]["application_close_rule"]
            | null
          application_open_mode:
            | Database["public"]["Enums"]["application_open_mode"]
            | null
          applications_close_at: string | null
          applications_open_at: string | null
          ask_motivation: boolean | null
          awards_published_at: string | null
          banner_path: string | null
          city: string | null
          collects_payments_manually: boolean | null
          committee_preference_count: number | null
          conference_time_status:
            | Database["public"]["Enums"]["known_or_tba"]
            | null
          contact_email: string | null
          contact_phone: string | null
          country_code: string | null
          created_at: string | null
          created_by: string | null
          creation_step: Database["public"]["Enums"]["creation_step"] | null
          currency: string | null
          description: string | null
          end_date: string | null
          end_time: string | null
          expected_delegates: number | null
          facebook_url: string | null
          fee_status: Database["public"]["Enums"]["fee_status"] | null
          id: string | null
          instagram_url: string | null
          kind: Database["public"]["Enums"]["conference_kind"] | null
          language: string | null
          level: Database["public"]["Enums"]["conference_level"] | null
          linkedin_url: string | null
          location_mode: Database["public"]["Enums"]["location_mode"] | null
          logo_path: string | null
          max_age: number | null
          min_age: number | null
          name: string | null
          organization_id: string | null
          organization_name: string | null
          organization_slug: string | null
          payment_instructions: string | null
          position_paper_deadline: string | null
          position_paper_required: boolean | null
          prefill_sources: Json | null
          show_schedule_publicly: boolean | null
          slug: string | null
          start_date: string | null
          start_time: string | null
          status: Database["public"]["Enums"]["conference_status"] | null
          tagline: string | null
          tiktok_url: string | null
          timezone: string | null
          updated_at: string | null
          venue_address: string | null
          venue_name: string | null
          venue_status: Database["public"]["Enums"]["known_or_tba"] | null
          website_url: string | null
          youtube_url: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organization_private_settings"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "conferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      delegation_member_details: {
        Row: {
          delegation_id: string | null
          dietary_requirements: string | null
          phone: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delegation_members_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "delegations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegation_members_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "delegations_with_heads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegation_members_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "participant_delegations"
            referencedColumns: ["id"]
          },
        ]
      }
      delegation_status_totals: {
        Row: {
          conference_id: string | null
          delegation_count: number | null
          requested_seats: number | null
          status: Database["public"]["Enums"]["delegation_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "delegations_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegations_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences_with_organization"
            referencedColumns: ["id"]
          },
        ]
      }
      delegations_with_heads: {
        Row: {
          conference_id: string | null
          country_code: string | null
          head_names: string[] | null
          head_names_text: string | null
          id: string | null
          institution_name: string | null
          name: string | null
          requested_seats: number | null
          status: Database["public"]["Enums"]["delegation_status"] | null
          submitted_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delegations_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegations_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences_with_organization"
            referencedColumns: ["id"]
          },
        ]
      }
      my_profile_state: {
        Row: {
          id: string | null
          is_platform_admin: boolean | null
          onboarding_completed_at: string | null
        }
        Insert: {
          id?: string | null
          is_platform_admin?: boolean | null
          onboarding_completed_at?: string | null
        }
        Update: {
          id?: string | null
          is_platform_admin?: boolean | null
          onboarding_completed_at?: string | null
        }
        Relationships: []
      }
      organization_private_settings: {
        Row: {
          created_by: string | null
          has_stripe_account: boolean | null
          organization_id: string | null
          stripe_account_id: string | null
          stripe_onboarding_completed_at: string | null
        }
        Insert: {
          created_by?: never
          has_stripe_account?: never
          organization_id?: string | null
          stripe_account_id?: never
          stripe_onboarding_completed_at?: string | null
        }
        Update: {
          created_by?: never
          has_stripe_account?: never
          organization_id?: string | null
          stripe_account_id?: never
          stripe_onboarding_completed_at?: string | null
        }
        Relationships: []
      }
      participant_delegations: {
        Row: {
          conference_id: string | null
          country_code: string | null
          id: string | null
          institution_name: string | null
          name: string | null
          status: Database["public"]["Enums"]["delegation_status"] | null
        }
        Insert: {
          conference_id?: string | null
          country_code?: string | null
          id?: string | null
          institution_name?: string | null
          name?: string | null
          status?: Database["public"]["Enums"]["delegation_status"] | null
        }
        Update: {
          conference_id?: string | null
          country_code?: string | null
          id?: string | null
          institution_name?: string | null
          name?: string | null
          status?: Database["public"]["Enums"]["delegation_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "delegations_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegations_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences_with_organization"
            referencedColumns: ["id"]
          },
        ]
      }
      public_seats: {
        Row: {
          committee_id: string | null
          country_code: string | null
          id: string | null
          is_taken: boolean | null
          kind: Database["public"]["Enums"]["seat_kind"] | null
          name: string | null
          position: number | null
        }
        Relationships: [
          {
            foreignKeyName: "seats_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "committees"
            referencedColumns: ["id"]
          },
        ]
      }
      published_awards: {
        Row: {
          committee_id: string | null
          holder_name: string | null
          id: string | null
          is_mine: boolean | null
          kind: Database["public"]["Enums"]["award_kind"] | null
          seat_country_code: string | null
          seat_name: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "awards_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "committees"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_application_deciders: {
        Row: {
          application_id: string | null
          decided_by: string | null
        }
        Insert: {
          application_id?: string | null
          decided_by?: string | null
        }
        Update: {
          application_id?: string | null
          decided_by?: string | null
        }
        Relationships: []
      }
      staff_contact_details: {
        Row: {
          email: string | null
          phone: string | null
          user_id: string | null
        }
        Insert: {
          email?: string | null
          phone?: string | null
          user_id?: string | null
        }
        Update: {
          email?: string | null
          phone?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      staff_welfare_details: {
        Row: {
          date_of_birth: string | null
          dietary_requirements: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          user_id: string | null
        }
        Insert: {
          date_of_birth?: string | null
          dietary_requirements?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          user_id?: string | null
        }
        Update: {
          date_of_birth?: string | null
          dietary_requirements?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_application: {
        Args: { application_id: string; seat_id: string }
        Returns: undefined
      }
      accept_application_team: {
        Args: { application_ids: string[]; seat_ids: string[] }
        Returns: undefined
      }
      accept_invite: { Args: { token: string }; Returns: string }
      accept_invite_by_id: { Args: { invite_id: string }; Returns: string }
      accept_invite_row: { Args: { invite_id: string }; Returns: string }
      add_paper_author: {
        Args: { paper_id: string; seat_id: string }
        Returns: undefined
      }
      allocate_delegation_seats: {
        Args: { delegation_id: string; seat_ids: string[] }
        Returns: undefined
      }
      amend_clause_list: {
        Args: {
          action: Database["public"]["Enums"]["amendment_action"]
          clauses: Json
          new_clause: Json
          target_clause_id: string
          text_markdown: string
        }
        Returns: Json
      }
      answer_amendment: {
        Args: { accepts: boolean; amendment_id: string }
        Returns: undefined
      }
      answer_directive: {
        Args: {
          answer?: string
          outcome: Database["public"]["Enums"]["paper_status"]
          paper_id: string
        }
        Returns: undefined
      }
      applicable_fee: {
        Args: {
          applies_to: Database["public"]["Enums"]["fee_applies_to"]
          conference_id: string
        }
        Returns: {
          amount_cents: number
          applies_to: Database["public"]["Enums"]["fee_applies_to"]
          conference_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          position: number
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        SetofOptions: {
          from: "*"
          to: "fees"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      application_team_names: {
        Args: { team_id: string }
        Returns: {
          full_name: string
          user_id: string
        }[]
      }
      apply_amendment_to_content: {
        Args: {
          action: Database["public"]["Enums"]["amendment_action"]
          content: Json
          new_clause_id: string
          target_clause_id: string
          target_part: string
          text_markdown: string
        }
        Returns: Json
      }
      apply_amendment_to_paper: {
        Args: {
          amendment_id: string
          final_status: Database["public"]["Enums"]["amendment_status"]
        }
        Returns: undefined
      }
      apply_committee_procedure: {
        Args: { committee_id: string; procedure_name: string }
        Returns: undefined
      }
      apply_passed_motion: {
        Args: {
          motion_id: string
          pressed_at?: string
          votes_against?: number
          votes_for?: number
        }
        Returns: string[]
      }
      approve_paper: {
        Args: { paper_id: string; sequence?: number; topic_number?: number }
        Returns: undefined
      }
      call_next_speaker: {
        Args: {
          committee_id: string
          pressed_at?: string
          speaking_entry_id?: string
        }
        Returns: string
      }
      can_grant: {
        Args: {
          conference_id: string
          permissions: Database["public"]["Enums"]["permission"][]
          scope: Database["public"]["Enums"]["role_scope"]
        }
        Returns: boolean
      }
      can_grant_role_permissions: {
        Args: { role_id: string }
        Returns: boolean
      }
      can_manage_invoice_note: {
        Args: { invoice_id: string }
        Returns: boolean
      }
      can_manage_member: {
        Args: { conference_id: string; user_id: string }
        Returns: boolean
      }
      can_manage_role: { Args: { role_id: string }; Returns: boolean }
      can_place_role: {
        Args: { conference_id: string; role_position: number }
        Returns: boolean
      }
      can_read_invoice_note: { Args: { invoice_id: string }; Returns: boolean }
      checked_comment_body: { Args: { body: string }; Returns: string }
      clock_seconds_left: {
        Args: {
          at_moment: string
          ends_at: string
          paused_remaining_seconds: number
        }
        Returns: number
      }
      committee_chair_invite_refusal: {
        Args: { committee_id: string; email: string }
        Returns: string
      }
      committee_has_delegates: {
        Args: { committee_id: string }
        Returns: boolean
      }
      committee_offers_paper_kind: {
        Args: {
          crisis_allows_resolutions: boolean
          format: Database["public"]["Enums"]["committee_format"]
          kind: Database["public"]["Enums"]["paper_kind"]
        }
        Returns: boolean
      }
      conference_audience_user_ids: {
        Args: {
          audience: Database["public"]["Enums"]["audience"]
          committee_id?: string
          conference_id: string
          delegation_id?: string
        }
        Returns: string[]
      }
      conference_has_invoices: {
        Args: { conference_id: string }
        Returns: boolean
      }
      conference_is_published: {
        Args: { conference_id: string }
        Returns: boolean
      }
      conference_takes_applications: {
        Args: { conference_id: string; route: string }
        Returns: boolean
      }
      conference_team_has_email: {
        Args: { conference_id: string; email: string }
        Returns: boolean
      }
      confirmable_committee_ids: { Args: never; Returns: string[] }
      copy_committee_procedure: {
        Args: { from_committee_id: string; to_committee_ids: string[] }
        Returns: undefined
      }
      create_delegation: {
        Args: {
          conference_id: string
          country_code: string
          institution_name: string
          name: string
          note: string
          requested_seats: number
        }
        Returns: string
      }
      create_quick_session: {
        Args: {
          committee_name: string
          committee_slug: string
          seats?: Json
          speaking_time_seconds?: number
          timezone?: string
          topic?: string
        }
        Returns: Database["public"]["CompositeTypes"]["quick_session_address"][]
        SetofOptions: {
          from: "*"
          to: "quick_session_address"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      decide_amendment: {
        Args: { amendment_id: string; decision: string; ruling?: string }
        Returns: undefined
      }
      delegation_member_holds_seat: {
        Args: { delegation_id: string; user_id: string }
        Returns: boolean
      }
      delegation_papers: {
        Args: { target_delegation_id: string }
        Returns: {
          committee_id: string
          committee_name: string
          committee_slug: string
          country_code: string
          draft_updated_at: string
          draft_updated_by: string
          draft_updated_by_name: string
          holder_id: string
          holder_name: string
          paper_kind: string
          review_comment: string
          review_status: Database["public"]["Enums"]["review_status"]
          seat_id: string
          seat_name: string
          word_count: number
        }[]
      }
      delete_comment: { Args: { comment_id: string }; Returns: undefined }
      delete_my_account: { Args: never; Returns: undefined }
      dissolve_lonely_application_team: {
        Args: { team_id: string }
        Returns: undefined
      }
      edit_comment: {
        Args: { body: string; comment_id: string }
        Returns: undefined
      }
      fee_has_invoices: { Args: { fee_id: string }; Returns: boolean }
      fee_invoice_counts: {
        Args: { conference_id: string }
        Returns: {
          fee_id: string
          invoice_count: number
        }[]
      }
      get_invite: {
        Args: { token: string }
        Returns: {
          accepted_at: string
          committee_name: string
          conference_name: string
          conference_slug: string
          email: string
          expires_at: string
          invited_by_name: string
          kind: Database["public"]["Enums"]["invite_kind"]
          organization_name: string
          organization_slug: string
          role: string
          role_permissions: Database["public"]["Enums"]["permission"][]
          role_scope: Database["public"]["Enums"]["role_scope"]
          status: string
        }[]
      }
      hand_paper_lead: {
        Args: { paper_id: string; seat_id: string }
        Returns: undefined
      }
      has_committee_permission: {
        Args: {
          committee_id: string
          permission: Database["public"]["Enums"]["permission"]
        }
        Returns: boolean
      }
      has_permission: {
        Args: {
          conference_id: string
          permission: Database["public"]["Enums"]["permission"]
        }
        Returns: boolean
      }
      holder_has_committee_permission: {
        Args: {
          committee_id: string
          permission: Database["public"]["Enums"]["permission"]
          user_id: string
        }
        Returns: boolean
      }
      holder_has_permission: {
        Args: {
          conference_id: string
          permission: Database["public"]["Enums"]["permission"]
          user_id: string
        }
        Returns: boolean
      }
      introduce_paper: {
        Args: { moment?: string; motion_id: string; paper_id: string }
        Returns: undefined
      }
      invite_sender_email: { Args: never; Returns: string }
      invoice_due_at: { Args: { conference_id: string }; Returns: string }
      invoice_payer_takes_part: {
        Args: { conference_id: string; payer_user_id: string }
        Returns: boolean
      }
      is_committee_delegate: {
        Args: { committee_id: string }
        Returns: boolean
      }
      is_conference_admitted: {
        Args: { conference_id: string }
        Returns: boolean
      }
      is_conference_owner: { Args: { conference_id: string }; Returns: boolean }
      is_conference_participant: {
        Args: { conference_id: string }
        Returns: boolean
      }
      is_conference_staff: { Args: { conference_id: string }; Returns: boolean }
      is_delegation_head: { Args: { delegation_id: string }; Returns: boolean }
      is_delegation_member: {
        Args: { delegation_id: string }
        Returns: boolean
      }
      is_organization_admin: { Args: { org_id: string }; Returns: boolean }
      is_organization_member: { Args: { org_id: string }; Returns: boolean }
      is_organization_owner: { Args: { org_id: string }; Returns: boolean }
      is_paper_author: { Args: { paper_id: string }; Returns: boolean }
      is_paper_lead: { Args: { paper_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_platform_admin_account: { Args: { user_id: string }; Returns: boolean }
      is_valid_clause_list: {
        Args: { clauses: Json; level: number }
        Returns: boolean
      }
      is_valid_paper_content: {
        Args: { content: Json; kind: Database["public"]["Enums"]["paper_kind"] }
        Returns: boolean
      }
      join_application_team: {
        Args: { application_id: string; code: string }
        Returns: string
      }
      join_delegation: { Args: { code: string }; Returns: string }
      lapse_pending_children: {
        Args: { amendment_id: string }
        Returns: undefined
      }
      leave_application_team: {
        Args: { application_id: string }
        Returns: undefined
      }
      leave_paper: { Args: { paper_id: string }; Returns: undefined }
      list_conference_owners: {
        Args: { conference_id: string }
        Returns: {
          organization_role: Database["public"]["Enums"]["organization_role"]
          user_id: string
        }[]
      }
      list_my_invites: {
        Args: never
        Returns: {
          conference_name: string
          expires_at: string
          id: string
          kind: Database["public"]["Enums"]["invite_kind"]
          organization_name: string
          role: string
        }[]
      }
      lock_amendment: {
        Args: { amendment_id: string }
        Returns: {
          action: Database["public"]["Enums"]["amendment_action"]
          based_on_version_id: string | null
          created_at: string
          decided_at: string | null
          id: string
          is_friendly: boolean
          paper_id: string
          parent_amendment_id: string | null
          proposed_by_seat_id: string | null
          queue_position: number | null
          ruling: string | null
          sequence: number
          status: Database["public"]["Enums"]["amendment_status"]
          target_clause_id: string | null
          target_part: string
          text_markdown: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "amendments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      lock_paper: {
        Args: { paper_id: string }
        Returns: {
          answer_markdown: string | null
          body_markdown: string | null
          committee_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          introduced_at: string | null
          introduced_by_motion_id: string | null
          is_open_for_signatures: boolean
          kind: Database["public"]["Enums"]["paper_kind"]
          lead_seat_id: string | null
          live_epoch: number
          operative_markdown: string | null
          preamble_markdown: string | null
          return_comment: string | null
          revision: number
          sequence: number | null
          signatures_opened_at: string | null
          started_by_seat_id: string | null
          status: Database["public"]["Enums"]["paper_status"]
          submitted_at: string | null
          title: string
          topic: string | null
          topic_number: number | null
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "committee_papers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      make_amendment_unfriendly: {
        Args: { amendment_id: string }
        Returns: undefined
      }
      may_change_conference_document: {
        Args: { object_name: string }
        Returns: boolean
      }
      may_delete_own_position_paper: {
        Args: { object_name: string }
        Returns: boolean
      }
      may_edit_paper_draft: {
        Args: { target_seat_id: string }
        Returns: boolean
      }
      may_join_paper_channel: { Args: { topic: string }; Returns: boolean }
      may_join_paper_writing_channel: {
        Args: { topic: string }
        Returns: boolean
      }
      may_read_paper: { Args: { paper_id: string }; Returns: boolean }
      may_read_thread: { Args: { thread_id: string }; Returns: boolean }
      may_see_public_media: { Args: { object_name: string }; Returns: boolean }
      may_upload_conference_document: {
        Args: { object_name: string }
        Returns: boolean
      }
      may_write_paper: { Args: { paper_id: string }; Returns: boolean }
      may_write_public_media: {
        Args: { object_name: string }
        Returns: boolean
      }
      member_organization_ids: { Args: never; Returns: string[] }
      move_conference_role: {
        Args: { direction: string; role_id: string }
        Returns: undefined
      }
      move_delegate: {
        Args: { from_seat_id: string; to_seat_id: string }
        Returns: undefined
      }
      my_committee_seat_id: { Args: { committee_id: string }; Returns: string }
      my_permissions: {
        Args: { conference_id: string }
        Returns: {
          permission: Database["public"]["Enums"]["permission"]
          scope: Database["public"]["Enums"]["role_scope"]
        }[]
      }
      my_rank: { Args: { conference_id: string }; Returns: number }
      new_application_team: { Args: { conference_id: string }; Returns: string }
      next_invoice_number: { Args: { conference_id: string }; Returns: string }
      notify_amendment_proposer: {
        Args: { amendment_id: string; outcome: string }
        Returns: undefined
      }
      notify_paper_seats: {
        Args: {
          kind: Database["public"]["Enums"]["notification_kind"]
          link_path: string
          paper_id: string
          roles: Database["public"]["Enums"]["paper_seat_role"][]
          title: string
        }
        Returns: undefined
      }
      notify_paper_users: {
        Args: {
          conference_id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          link_path: string
          title: string
          user_ids: string[]
        }
        Returns: undefined
      }
      organization_has_email: {
        Args: { email: string; org_id: string }
        Returns: boolean
      }
      own_open_application: {
        Args: { application_id: string }
        Returns: {
          answers: Json
          committee_preferences: string[]
          conference_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          internal_note: string | null
          motivation: string | null
          seat_preferences: string | null
          status: Database["public"]["Enums"]["application_status"]
          submitted_at: string | null
          team_id: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      paper_clause_whitespace: { Args: never; Returns: string }
      paper_clause_words: { Args: { line: string }; Returns: string }
      paper_clauses_from_markdown: {
        Args: { operative_markdown: string; preamble_markdown: string }
        Returns: Json
      }
      paper_clauses_with_ids: {
        Args: { clauses: Json; level: number; parent_id: string }
        Returns: Json
      }
      paper_clauses_without_empty: { Args: { clauses: Json }; Returns: Json }
      paper_conference_id: { Args: { paper_id: string }; Returns: string }
      paper_content_has_clause: {
        Args: { clause_id: string; content: Json; part: string }
        Returns: boolean
      }
      paper_kind_name: {
        Args: { kind: Database["public"]["Enums"]["paper_kind"] }
        Returns: string
      }
      paper_label: {
        Args: {
          kind: Database["public"]["Enums"]["paper_kind"]
          sequence: number
          title: string
          topic_number: number
        }
        Returns: string
      }
      paper_link_path: { Args: { paper_id: string }; Returns: string }
      paper_list_items_from_markdown: {
        Args: { markdown: string }
        Returns: Json
      }
      paper_nest_list_items: {
        Args: { items: Json; level: number }
        Returns: Json
      }
      paper_operative_clauses: { Args: { markdown: string }; Returns: Json }
      paper_position_letters: { Args: { place: number }; Returns: string }
      paper_preamble_clauses: { Args: { markdown: string }; Returns: Json }
      paper_support_needed: {
        Args: {
          committee_id: string
          minimum: number
          unit: Database["public"]["Enums"]["support_unit"]
        }
        Returns: number
      }
      participant_conference_ids: { Args: never; Returns: string[] }
      participant_list_delegation_ids: { Args: never; Returns: string[] }
      permitted_committee_ids: {
        Args: { permission: Database["public"]["Enums"]["permission"] }
        Returns: string[]
      }
      permitted_conference_ids: {
        Args: { permission: Database["public"]["Enums"]["permission"] }
        Returns: string[]
      }
      platform_fee_per_delegate_cents: { Args: never; Returns: number }
      preset_conference_roles: {
        Args: never
        Returns: {
          is_public: boolean
          name: string
          permissions: Database["public"]["Enums"]["permission"][]
          role_position: number
          scope: Database["public"]["Enums"]["role_scope"]
        }[]
      }
      preview_delegation: {
        Args: { code: string }
        Returns: {
          conference_city: string
          conference_country_code: string
          conference_end_date: string
          conference_name: string
          conference_slug: string
          conference_start_date: string
          conference_status: Database["public"]["Enums"]["conference_status"]
          country_code: string
          head_names: string[]
          id: string
          institution_name: string
          member_count: number
          name: string
          status: Database["public"]["Enums"]["delegation_status"]
        }[]
      }
      private_details_user_ids: {
        Args: { permission: Database["public"]["Enums"]["permission"] }
        Returns: string[]
      }
      propose_amendment: {
        Args: {
          action: Database["public"]["Enums"]["amendment_action"]
          paper_id: string
          parent_amendment_id?: string
          target_clause_id: string
          target_part: string
          text_markdown: string
        }
        Returns: string
      }
      queue_unreferenced_uploads: { Args: never; Returns: number }
      remove_application_from_team: {
        Args: { application_id: string }
        Returns: undefined
      }
      remove_delegation_seat: { Args: { seat_id: string }; Returns: undefined }
      remove_signature: { Args: { paper_id: string }; Returns: undefined }
      reopen_thread: { Args: { thread_id: string }; Returns: undefined }
      reorder_amendments: {
        Args: { amendment_ids: string[]; committee_id: string }
        Returns: undefined
      }
      reply_to_thread: {
        Args: { body: string; thread_id: string }
        Returns: string
      }
      resolve_thread: { Args: { thread_id: string }; Returns: undefined }
      return_paper: {
        Args: { comment: string; paper_id: string }
        Returns: undefined
      }
      revoke_seat: { Args: { seat_id: string }; Returns: undefined }
      route_unfriendly_amendment: {
        Args: { amendment_id: string }
        Returns: undefined
      }
      save_committee_paper_text: {
        Args: {
          body_markdown?: string
          document_state: string
          expected_revision: number
          operative_markdown?: string
          paper_id: string
          preamble_markdown?: string
        }
        Returns: number
      }
      seat_list_committee_ids: { Args: never; Returns: string[] }
      send_amendment_to_the_dais: {
        Args: { amendment_id: string; is_friendly: boolean }
        Returns: undefined
      }
      send_crisis_update: {
        Args: { committee_id: string; message: string }
        Returns: undefined
      }
      session_notes_markdown_from_html: {
        Args: { html: string }
        Returns: string
      }
      set_awards_published_at: {
        Args: { conference_id: string; published_at: string }
        Returns: undefined
      }
      set_invoice_checkout_session: {
        Args: { invoice_id: string; session_id: string }
        Returns: undefined
      }
      set_member_roles: {
        Args: { conference_id: string; role_ids: string[]; user_id: string }
        Returns: undefined
      }
      set_paper_signatures_open: {
        Args: { is_open: boolean; paper_id: string }
        Returns: undefined
      }
      set_schedule_publicity: {
        Args: { conference_id: string; is_public: boolean }
        Returns: undefined
      }
      set_seat_availability: {
        Args: { is_available: boolean; seat_id: string }
        Returns: undefined
      }
      set_stripe_account: {
        Args: { organization_id: string; stripe_account_id: string }
        Returns: undefined
      }
      sign_amendment: { Args: { amendment_id: string }; Returns: undefined }
      sign_paper: { Args: { paper_id: string }; Returns: undefined }
      staff_conference_ids: { Args: never; Returns: string[] }
      start_application_team: {
        Args: { application_id: string }
        Returns: string
      }
      start_committee_session: {
        Args: { committee_id: string; name: string; pressed_at?: string }
        Returns: string
      }
      start_paper: {
        Args: {
          committee_id: string
          kind: Database["public"]["Enums"]["paper_kind"]
          source_paper_ids?: string[]
          title: string
          topic?: string
        }
        Returns: string
      }
      start_single_speaker: {
        Args: {
          committee_id: string
          pressed_at?: string
          purpose?: string
          seat_id?: string
          speaker_name?: string
          speaking_time_seconds?: number
        }
        Returns: undefined
      }
      start_thread: {
        Args: {
          anchor_end?: string
          anchor_fragment?: string
          anchor_start?: string
          body: string
          committee_paper_id?: string
          position_paper_seat_id?: string
          quoted_text?: string
          suggestion_id?: string
        }
        Returns: string
      }
      submit_paper: {
        Args: { content?: Json; expected_revision: number; paper_id: string }
        Returns: undefined
      }
      swap_delegates: {
        Args: { first_seat_id: string; second_seat_id: string }
        Returns: undefined
      }
      team_applications: {
        Args: { application_id: string; partner_application_id: string }
        Returns: string
      }
      thread_accepts_comments: { Args: { thread_id: string }; Returns: boolean }
      unreferenced_uploads: {
        Args: { uploaded_before?: string }
        Returns: {
          bucket_id: string
          name: string
        }[]
      }
      upload_folder_has_room: {
        Args: { bucket: string; object_name: string }
        Returns: boolean
      }
      user_rank: {
        Args: { conference_id: string; user_id: string }
        Returns: number
      }
      withdraw_amendment: { Args: { amendment_id: string }; Returns: undefined }
      withdraw_paper: { Args: { paper_id: string }; Returns: undefined }
    }
    Enums: {
      amendment_action: "add" | "change" | "strike"
      amendment_status:
        | "awaiting_sponsors"
        | "collecting_support"
        | "with_the_dais"
        | "approved"
        | "written_in"
        | "passed"
        | "failed"
        | "out_of_order"
        | "withdrawn"
        | "lapsed"
      application_close_rule: "relative" | "fixed"
      application_open_mode: "manual" | "on_publish" | "scheduled"
      application_status:
        | "draft"
        | "submitted"
        | "accepted"
        | "rejected"
        | "waitlisted"
        | "withdrawn"
      attendance_status: "absent" | "present" | "present_and_voting"
      audience: "everyone" | "delegates" | "staff" | "committee" | "delegation"
      award_kind:
        | "best_delegate"
        | "outstanding_delegate"
        | "honourable_mention"
        | "verbal_commendation"
        | "best_position_paper"
        | "custom"
      award_status: "proposed" | "confirmed"
      committee_format: "standard" | "crisis"
      committee_mode:
        | "idle"
        | "formal_debate"
        | "moderated_caucus"
        | "unmoderated_caucus"
        | "voting"
        | "suspended"
        | "single_speaker"
      conference_kind: "conference" | "quick_session"
      conference_level: "high_school" | "university" | "mixed"
      conference_status: "draft" | "published" | "archived"
      creation_step: "basics" | "when" | "setup" | "launch"
      delegation_role: "head" | "member"
      delegation_status:
        | "draft"
        | "submitted"
        | "accepted"
        | "rejected"
        | "withdrawn"
      document_kind:
        | "position_paper"
        | "background_guide"
        | "resource"
        | "working_paper"
        | "draft_resolution"
      experience_level: "none" | "beginner" | "intermediate" | "advanced"
      fee_applies_to: "individual" | "delegation_member"
      fee_status: "free" | "paid" | "undecided"
      invite_kind: "organization_member" | "conference_staff"
      invoice_status: "unpaid" | "paid" | "waived" | "refunded" | "void"
      known_or_tba: "known" | "tba"
      location_mode: "in_person" | "online" | "hybrid"
      majority_type: "simple" | "two_thirds"
      motion_kind:
        | "moderated_caucus"
        | "unmoderated_caucus"
        | "extend_caucus"
        | "suspend_meeting"
        | "adjourn_meeting"
        | "close_debate"
        | "introduce_document"
        | "other"
      motion_status: "proposed" | "passed" | "failed" | "withdrawn" | "dropped"
      notification_kind:
        | "application_decided"
        | "seat_allocated"
        | "delegation_decided"
        | "delegation_seat_assigned"
        | "invoice_created"
        | "invoice_paid"
        | "announcement"
        | "document_reviewed"
        | "award_published"
        | "invite_received"
        | "schedule_changed"
        | "paper_author_added"
        | "paper_returned"
        | "paper_approved"
        | "paper_introduced"
        | "paper_comment_reply"
        | "paper_comment_thread"
        | "amendment_awaits_answer"
        | "amendment_decided"
        | "directive_answered"
      organization_role: "owner" | "admin" | "member"
      paper_kind:
        | "working_paper"
        | "draft_resolution"
        | "committee_directive"
        | "joint_directive"
        | "personal_directive"
        | "press_release"
      paper_seat_role: "author" | "signatory"
      paper_status:
        | "writing"
        | "submitted"
        | "approved"
        | "introduced"
        | "passed"
        | "failed"
        | "withdrawn"
        | "carried_out"
        | "refused"
        | "published"
      paper_words: "sponsors_and_signatories" | "submitters"
      permission:
        | "administrator"
        | "edit_conference"
        | "manage_team"
        | "manage_roles"
        | "manage_committees"
        | "run_room"
        | "review_papers"
        | "write_chair_notes"
        | "propose_awards"
        | "confirm_awards"
        | "answer_directives"
        | "read_applications"
        | "decide_applications"
        | "read_participants"
        | "read_contact_details"
        | "read_welfare_details"
        | "read_invoices"
        | "manage_invoices"
        | "edit_schedule"
        | "send_announcements"
        | "manage_documents"
      question_type:
        | "short_text"
        | "long_text"
        | "single_choice"
        | "multiple_choice"
        | "checkbox"
      review_status: "submitted" | "approved" | "changes_requested"
      role_scope: "conference" | "committees"
      seat_kind: "country" | "character" | "observer" | "other"
      session_status: "scheduled" | "in_progress" | "ended"
      speaker_status: "waiting" | "speaking" | "spoken" | "removed"
      speakers_list_kind: "general" | "caucus" | "single"
      support_unit: "seats" | "percent"
      vote_choice: "for" | "against" | "abstain"
      vote_kind: "procedural" | "substantive"
      vote_method: "show_of_hands" | "roll_call"
      vote_status: "open" | "closed"
    }
    CompositeTypes: {
      quick_session_address: {
        conference_slug: string | null
        committee_slug: string | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      amendment_action: ["add", "change", "strike"],
      amendment_status: [
        "awaiting_sponsors",
        "collecting_support",
        "with_the_dais",
        "approved",
        "written_in",
        "passed",
        "failed",
        "out_of_order",
        "withdrawn",
        "lapsed",
      ],
      application_close_rule: ["relative", "fixed"],
      application_open_mode: ["manual", "on_publish", "scheduled"],
      application_status: [
        "draft",
        "submitted",
        "accepted",
        "rejected",
        "waitlisted",
        "withdrawn",
      ],
      attendance_status: ["absent", "present", "present_and_voting"],
      audience: ["everyone", "delegates", "staff", "committee", "delegation"],
      award_kind: [
        "best_delegate",
        "outstanding_delegate",
        "honourable_mention",
        "verbal_commendation",
        "best_position_paper",
        "custom",
      ],
      award_status: ["proposed", "confirmed"],
      committee_format: ["standard", "crisis"],
      committee_mode: [
        "idle",
        "formal_debate",
        "moderated_caucus",
        "unmoderated_caucus",
        "voting",
        "suspended",
        "single_speaker",
      ],
      conference_kind: ["conference", "quick_session"],
      conference_level: ["high_school", "university", "mixed"],
      conference_status: ["draft", "published", "archived"],
      creation_step: ["basics", "when", "setup", "launch"],
      delegation_role: ["head", "member"],
      delegation_status: [
        "draft",
        "submitted",
        "accepted",
        "rejected",
        "withdrawn",
      ],
      document_kind: [
        "position_paper",
        "background_guide",
        "resource",
        "working_paper",
        "draft_resolution",
      ],
      experience_level: ["none", "beginner", "intermediate", "advanced"],
      fee_applies_to: ["individual", "delegation_member"],
      fee_status: ["free", "paid", "undecided"],
      invite_kind: ["organization_member", "conference_staff"],
      invoice_status: ["unpaid", "paid", "waived", "refunded", "void"],
      known_or_tba: ["known", "tba"],
      location_mode: ["in_person", "online", "hybrid"],
      majority_type: ["simple", "two_thirds"],
      motion_kind: [
        "moderated_caucus",
        "unmoderated_caucus",
        "extend_caucus",
        "suspend_meeting",
        "adjourn_meeting",
        "close_debate",
        "introduce_document",
        "other",
      ],
      motion_status: ["proposed", "passed", "failed", "withdrawn", "dropped"],
      notification_kind: [
        "application_decided",
        "seat_allocated",
        "delegation_decided",
        "delegation_seat_assigned",
        "invoice_created",
        "invoice_paid",
        "announcement",
        "document_reviewed",
        "award_published",
        "invite_received",
        "schedule_changed",
        "paper_author_added",
        "paper_returned",
        "paper_approved",
        "paper_introduced",
        "paper_comment_reply",
        "paper_comment_thread",
        "amendment_awaits_answer",
        "amendment_decided",
        "directive_answered",
      ],
      organization_role: ["owner", "admin", "member"],
      paper_kind: [
        "working_paper",
        "draft_resolution",
        "committee_directive",
        "joint_directive",
        "personal_directive",
        "press_release",
      ],
      paper_seat_role: ["author", "signatory"],
      paper_status: [
        "writing",
        "submitted",
        "approved",
        "introduced",
        "passed",
        "failed",
        "withdrawn",
        "carried_out",
        "refused",
        "published",
      ],
      paper_words: ["sponsors_and_signatories", "submitters"],
      permission: [
        "administrator",
        "edit_conference",
        "manage_team",
        "manage_roles",
        "manage_committees",
        "run_room",
        "review_papers",
        "write_chair_notes",
        "propose_awards",
        "confirm_awards",
        "answer_directives",
        "read_applications",
        "decide_applications",
        "read_participants",
        "read_contact_details",
        "read_welfare_details",
        "read_invoices",
        "manage_invoices",
        "edit_schedule",
        "send_announcements",
        "manage_documents",
      ],
      question_type: [
        "short_text",
        "long_text",
        "single_choice",
        "multiple_choice",
        "checkbox",
      ],
      review_status: ["submitted", "approved", "changes_requested"],
      role_scope: ["conference", "committees"],
      seat_kind: ["country", "character", "observer", "other"],
      session_status: ["scheduled", "in_progress", "ended"],
      speaker_status: ["waiting", "speaking", "spoken", "removed"],
      speakers_list_kind: ["general", "caucus", "single"],
      support_unit: ["seats", "percent"],
      vote_choice: ["for", "against", "abstain"],
      vote_kind: ["procedural", "substantive"],
      vote_method: ["show_of_hands", "roll_call"],
      vote_status: ["open", "closed"],
    },
  },
} as const

