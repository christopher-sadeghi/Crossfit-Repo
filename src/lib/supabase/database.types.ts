export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      athlete_intakes: {
        Row: { id: string; athlete_id: string; coach_id: string; status: string; current_step: number; answers: Json; requested_at: string; completed_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; athlete_id: string; coach_id: string; status?: string; current_step?: number; answers?: Json; requested_at?: string; completed_at?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; athlete_id?: string; coach_id?: string; status?: string; current_step?: number; answers?: Json; requested_at?: string; completed_at?: string | null; created_at?: string; updated_at?: string };
        Relationships: [
          { foreignKeyName: "athlete_intakes_athlete_id_coach_id_fkey"; columns: ["athlete_id", "coach_id"]; isOneToOne: true; referencedRelation: "athletes"; referencedColumns: ["id", "coach_id"] },
          { foreignKeyName: "athlete_intakes_coach_id_fkey"; columns: ["coach_id"]; isOneToOne: false; referencedRelation: "coaches"; referencedColumns: ["id"] },
        ];
      };
      messages: {
        Row: { id: string; athlete_id: string; coach_id: string; sender_id: string; body: string; link_type: string | null; link_id: string | null; read_at: string | null; created_at: string };
        Insert: { id?: string; athlete_id: string; coach_id: string; sender_id?: string; body: string; link_type?: string | null; link_id?: string | null; read_at?: string | null; created_at?: string };
        Update: { id?: string; athlete_id?: string; coach_id?: string; sender_id?: string; body?: string; link_type?: string | null; link_id?: string | null; read_at?: string | null; created_at?: string };
        Relationships: [
          { foreignKeyName: "messages_athlete_id_fkey"; columns: ["athlete_id"]; isOneToOne: false; referencedRelation: "athletes"; referencedColumns: ["id"] },
          { foreignKeyName: "messages_coach_id_fkey"; columns: ["coach_id"]; isOneToOne: false; referencedRelation: "coaches"; referencedColumns: ["id"] }
        ];
      };
      notifications: {
        Row: { id: string; recipient_id: string; athlete_id: string | null; kind: string; title: string; body: string | null; link: string | null; dedupe_key: string | null; read_at: string | null; created_at: string };
        Insert: { id?: string; recipient_id: string; athlete_id?: string | null; kind: string; title: string; body?: string | null; link?: string | null; dedupe_key?: string | null; read_at?: string | null; created_at?: string };
        Update: { id?: string; recipient_id?: string; athlete_id?: string | null; kind?: string; title?: string; body?: string | null; link?: string | null; dedupe_key?: string | null; read_at?: string | null; created_at?: string };
        Relationships: [
          { foreignKeyName: "notifications_athlete_id_fkey"; columns: ["athlete_id"]; isOneToOne: false; referencedRelation: "athletes"; referencedColumns: ["id"] }
        ];
      };
      notification_settings: {
        Row: { user_id: string; email_enabled: boolean; email_frequency: string; updated_at: string };
        Insert: { user_id?: string; email_enabled?: boolean; email_frequency?: string; updated_at?: string };
        Update: { user_id?: string; email_enabled?: boolean; email_frequency?: string; updated_at?: string };
        Relationships: [];
      };
      athlete_workout_overrides: {
        Row: { id: string; coach_id: string; athlete_id: string; workout_id: string; replacement_workout_id: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; coach_id?: string; athlete_id: string; workout_id: string; replacement_workout_id?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; coach_id?: string; athlete_id?: string; workout_id?: string; replacement_workout_id?: string | null; created_at?: string; updated_at?: string };
        Relationships: [
          { foreignKeyName: "athlete_workout_overrides_athlete_id_coach_id_fkey"; columns: ["athlete_id", "coach_id"]; isOneToOne: false; referencedRelation: "athletes"; referencedColumns: ["id", "coach_id"] },
          { foreignKeyName: "athlete_workout_overrides_workout_id_fkey"; columns: ["workout_id"]; isOneToOne: false; referencedRelation: "workouts"; referencedColumns: ["id"] },
          { foreignKeyName: "athlete_workout_overrides_replacement_workout_id_fkey"; columns: ["replacement_workout_id"]; isOneToOne: true; referencedRelation: "workouts"; referencedColumns: ["id"] }
        ];
      };
      ai_chat_messages: {
        Row: {
          cleared: boolean;
          coach_id: string;
          content: string;
          context: Json | null;
          created_at: string;
          id: string;
          role: string;
          suggestion_ids: string[];
        };
        ComputedFields: never;
        Insert: {
          cleared?: boolean;
          coach_id?: string;
          content: string;
          context?: Json | null;
          created_at?: string;
          id?: string;
          role: string;
          suggestion_ids?: string[];
        };
        Update: {
          cleared?: boolean;
          coach_id?: string;
          content?: string;
          context?: Json | null;
          created_at?: string;
          id?: string;
          role?: string;
          suggestion_ids?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "ai_chat_messages_coach_id_fkey";
            columns: ["coach_id"];
            isOneToOne: false;
            referencedRelation: "coaches";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_suggestions: {
        Row: {
          athlete_id: string | null;
          coach_id: string;
          coach_reviewed_at: string | null;
          created_at: string;
          decided_at: string | null;
          error: string | null;
          final: Json | null;
          id: string;
          input: NonNullable<Json>;
          model: string | null;
          proposal: Json | null;
          requested_by: string | null;
          status: Database["public"]["Enums"]["suggestion_status"];
          suggestion_type: Database["public"]["Enums"]["suggestion_type"];
          target_id: string | null;
          target_table: string | null;
        };
        ComputedFields: never;
        Insert: {
          athlete_id?: string | null;
          coach_id?: string;
          coach_reviewed_at?: string | null;
          created_at?: string;
          decided_at?: string | null;
          error?: string | null;
          final?: Json | null;
          id?: string;
          input?: NonNullable<Json>;
          model?: string | null;
          proposal?: Json | null;
          requested_by?: string | null;
          status?: Database["public"]["Enums"]["suggestion_status"];
          suggestion_type: Database["public"]["Enums"]["suggestion_type"];
          target_id?: string | null;
          target_table?: string | null;
        };
        Update: {
          athlete_id?: string | null;
          coach_id?: string;
          coach_reviewed_at?: string | null;
          created_at?: string;
          decided_at?: string | null;
          error?: string | null;
          final?: Json | null;
          id?: string;
          input?: NonNullable<Json>;
          model?: string | null;
          proposal?: Json | null;
          requested_by?: string | null;
          status?: Database["public"]["Enums"]["suggestion_status"];
          suggestion_type?: Database["public"]["Enums"]["suggestion_type"];
          target_id?: string | null;
          target_table?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_suggestions_athlete_id_coach_id_fkey";
            columns: ["athlete_id", "coach_id"];
            isOneToOne: false;
            referencedRelation: "athletes";
            referencedColumns: ["id", "coach_id"];
          },
          {
            foreignKeyName: "ai_suggestions_coach_id_fkey";
            columns: ["coach_id"];
            isOneToOne: false;
            referencedRelation: "coaches";
            referencedColumns: ["id"];
          },
        ];
      };
      athlete_food_preferences: {
        Row: {
          allergies: string[];
          athlete_id: string;
          coach_id: string;
          cooking_minutes: number | null;
          created_at: string;
          diet_type: string;
          dislikes: string[];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          allergies?: string[];
          athlete_id: string;
          coach_id: string;
          cooking_minutes?: number | null;
          created_at?: string;
          diet_type?: string;
          dislikes?: string[];
          updated_at?: string;
        };
        Update: {
          allergies?: string[];
          athlete_id?: string;
          coach_id?: string;
          cooking_minutes?: number | null;
          created_at?: string;
          diet_type?: string;
          dislikes?: string[];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "athlete_food_preferences_athlete_id_coach_id_fkey";
            columns: ["athlete_id", "coach_id"];
            isOneToOne: true;
            referencedRelation: "athletes";
            referencedColumns: ["id", "coach_id"];
          },
          {
            foreignKeyName: "athlete_food_preferences_coach_id_fkey";
            columns: ["coach_id"];
            isOneToOne: false;
            referencedRelation: "coaches";
            referencedColumns: ["id"];
          },
        ];
      };
      athlete_invites: {
        Row: {
          accepted_at: string | null;
          athlete_id: string;
          coach_id: string;
          created_at: string;
          email: string;
          id: string;
          revoked_at: string | null;
          token: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          athlete_id: string;
          coach_id?: string;
          created_at?: string;
          email: string;
          id?: string;
          revoked_at?: string | null;
          token?: string;
        };
        Update: {
          accepted_at?: string | null;
          athlete_id?: string;
          coach_id?: string;
          created_at?: string;
          email?: string;
          id?: string;
          revoked_at?: string | null;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: "athlete_invites_athlete_id_coach_id_fkey";
            columns: ["athlete_id", "coach_id"];
            isOneToOne: false;
            referencedRelation: "athletes";
            referencedColumns: ["id", "coach_id"];
          },
          {
            foreignKeyName: "athlete_invites_coach_id_fkey";
            columns: ["coach_id"];
            isOneToOne: false;
            referencedRelation: "coaches";
            referencedColumns: ["id"];
          },
        ];
      };
      athlete_journal_entries: {
        Row: {
          alcohol: boolean;
          athlete_id: string;
          coach_id: string;
          created_at: string;
          entry_on: string;
          soreness: number | null;
          soreness_areas: string[];
          stress: number | null;
          energy: number | null;
          mood: number | null;
          readiness: number | null;
          hit_water_goal: boolean;
          id: string;
          late_caffeine: boolean;
          late_meal: boolean;
          mobility: boolean;
          notes: string | null;
          screens_in_bed: boolean;
          sleep_hours: number | null;
          sleep_quality: number | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          alcohol?: boolean;
          athlete_id: string;
          coach_id: string;
          created_at?: string;
          entry_on?: string;
          soreness?: number | null;
          soreness_areas?: string[];
          stress?: number | null;
          energy?: number | null;
          mood?: number | null;
          readiness?: never;
          hit_water_goal?: boolean;
          id?: string;
          late_caffeine?: boolean;
          late_meal?: boolean;
          mobility?: boolean;
          notes?: string | null;
          screens_in_bed?: boolean;
          sleep_hours?: number | null;
          sleep_quality?: number | null;
          updated_at?: string;
        };
        Update: {
          alcohol?: boolean;
          athlete_id?: string;
          coach_id?: string;
          created_at?: string;
          entry_on?: string;
          soreness?: number | null;
          soreness_areas?: string[];
          stress?: number | null;
          energy?: number | null;
          mood?: number | null;
          readiness?: never;
          hit_water_goal?: boolean;
          id?: string;
          late_caffeine?: boolean;
          late_meal?: boolean;
          mobility?: boolean;
          notes?: string | null;
          screens_in_bed?: boolean;
          sleep_hours?: number | null;
          sleep_quality?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "athlete_journal_entries_athlete_id_coach_id_fkey";
            columns: ["athlete_id", "coach_id"];
            isOneToOne: false;
            referencedRelation: "athletes";
            referencedColumns: ["id", "coach_id"];
          },
          {
            foreignKeyName: "athlete_journal_entries_coach_id_fkey";
            columns: ["coach_id"];
            isOneToOne: false;
            referencedRelation: "coaches";
            referencedColumns: ["id"];
          },
        ];
      };
      athlete_workout_scalings: {
        Row: {
          athlete_adjusted_at: string | null;
          athlete_id: string;
          athlete_suggestion_id: string | null;
          coach_details: Json | null;
          coach_id: string;
          coach_modifications: string | null;
          created_at: string;
          details: Json | null;
          id: string;
          modifications: string;
          updated_at: string;
          workout_id: string;
        };
        ComputedFields: never;
        Insert: {
          athlete_adjusted_at?: string | null;
          athlete_id: string;
          athlete_suggestion_id?: string | null;
          coach_details?: Json | null;
          coach_id?: string;
          coach_modifications?: string | null;
          created_at?: string;
          details?: Json | null;
          id?: string;
          modifications: string;
          updated_at?: string;
          workout_id: string;
        };
        Update: {
          athlete_adjusted_at?: string | null;
          athlete_id?: string;
          athlete_suggestion_id?: string | null;
          coach_details?: Json | null;
          coach_id?: string;
          coach_modifications?: string | null;
          created_at?: string;
          details?: Json | null;
          id?: string;
          modifications?: string;
          updated_at?: string;
          workout_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "athlete_workout_scalings_athlete_id_coach_id_fkey";
            columns: ["athlete_id", "coach_id"];
            isOneToOne: false;
            referencedRelation: "athletes";
            referencedColumns: ["id", "coach_id"];
          },
          {
            foreignKeyName: "athlete_workout_scalings_coach_id_fkey";
            columns: ["coach_id"];
            isOneToOne: false;
            referencedRelation: "coaches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "athlete_workout_scalings_workout_id_coach_id_fkey";
            columns: ["workout_id", "coach_id"];
            isOneToOne: false;
            referencedRelation: "workouts";
            referencedColumns: ["id", "coach_id"];
          },
        ];
      };
      athletes: {
        Row: {
          birth_date: string | null;
          coach_id: string;
          created_at: string;
          email: string | null;
          experience_level: Database["public"]["Enums"]["experience_level"];
          first_name: string;
          height_cm: number | null;
          id: string;
          injuries: string | null;
          last_name: string;
          notes: string | null;
          sex: string | null;
          status: Database["public"]["Enums"]["athlete_status"];
          updated_at: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          birth_date?: string | null;
          coach_id?: string;
          created_at?: string;
          email?: string | null;
          experience_level?: Database["public"]["Enums"]["experience_level"];
          first_name: string;
          height_cm?: number | null;
          id?: string;
          injuries?: string | null;
          last_name: string;
          notes?: string | null;
          sex?: string | null;
          status?: Database["public"]["Enums"]["athlete_status"];
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          birth_date?: string | null;
          coach_id?: string;
          created_at?: string;
          email?: string | null;
          experience_level?: Database["public"]["Enums"]["experience_level"];
          first_name?: string;
          height_cm?: number | null;
          id?: string;
          injuries?: string | null;
          last_name?: string;
          notes?: string | null;
          sex?: string | null;
          status?: Database["public"]["Enums"]["athlete_status"];
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "athlete_workout_scalings_athlete_suggestion_id_fkey";
            columns: ["athlete_suggestion_id"];
            isOneToOne: false;
            referencedRelation: "ai_suggestions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "athletes_coach_id_fkey";
            columns: ["coach_id"];
            isOneToOne: false;
            referencedRelation: "coaches";
            referencedColumns: ["id"];
          },
        ];
      };
      benchmark_results: {
        Row: {
          athlete_id: string;
          benchmark_id: string;
          coach_id: string;
          created_at: string;
          id: string;
          is_rx: boolean;
          load_kg: number | null;
          logged_by: string | null;
          notes: string | null;
          performed_on: string;
          rep_max: number | null;
          reps: number | null;
          rounds: number | null;
          time_seconds: number | null;
        };
        ComputedFields: never;
        Insert: {
          athlete_id: string;
          benchmark_id: string;
          coach_id?: string;
          created_at?: string;
          id?: string;
          is_rx?: boolean;
          load_kg?: number | null;
          logged_by?: string | null;
          notes?: string | null;
          performed_on: string;
          rep_max?: number | null;
          reps?: number | null;
          rounds?: number | null;
          time_seconds?: number | null;
        };
        Update: {
          athlete_id?: string;
          benchmark_id?: string;
          coach_id?: string;
          created_at?: string;
          id?: string;
          is_rx?: boolean;
          load_kg?: number | null;
          logged_by?: string | null;
          notes?: string | null;
          performed_on?: string;
          rep_max?: number | null;
          reps?: number | null;
          rounds?: number | null;
          time_seconds?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "benchmark_results_athlete_id_coach_id_fkey";
            columns: ["athlete_id", "coach_id"];
            isOneToOne: false;
            referencedRelation: "athletes";
            referencedColumns: ["id", "coach_id"];
          },
          {
            foreignKeyName: "benchmark_results_benchmark_id_fkey";
            columns: ["benchmark_id"];
            isOneToOne: false;
            referencedRelation: "benchmarks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "benchmark_results_coach_id_fkey";
            columns: ["coach_id"];
            isOneToOne: false;
            referencedRelation: "coaches";
            referencedColumns: ["id"];
          },
        ];
      };
      benchmark_settings: {
        Row: {
          benchmark_id: string;
          coach_id: string;
          retest_weeks: number | null;
        };
        ComputedFields: never;
        Insert: {
          benchmark_id: string;
          coach_id?: string;
          retest_weeks?: number | null;
        };
        Update: {
          benchmark_id?: string;
          coach_id?: string;
          retest_weeks?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "benchmark_settings_benchmark_id_fkey";
            columns: ["benchmark_id"];
            isOneToOne: false;
            referencedRelation: "benchmarks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "benchmark_settings_coach_id_fkey";
            columns: ["coach_id"];
            isOneToOne: false;
            referencedRelation: "coaches";
            referencedColumns: ["id"];
          },
        ];
      };
      benchmarks: {
        Row: {
          coach_id: string | null;
          created_at: string;
          description: string | null;
          id: string;
          kind: Database["public"]["Enums"]["benchmark_kind"];
          movement_id: string | null;
          name: string;
          workout_type: Database["public"]["Enums"]["workout_type"];
        };
        ComputedFields: never;
        Insert: {
          coach_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["benchmark_kind"];
          movement_id?: string | null;
          name: string;
          workout_type: Database["public"]["Enums"]["workout_type"];
        };
        Update: {
          coach_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["benchmark_kind"];
          movement_id?: string | null;
          name?: string;
          workout_type?: Database["public"]["Enums"]["workout_type"];
        };
        Relationships: [
          {
            foreignKeyName: "benchmarks_coach_id_fkey";
            columns: ["coach_id"];
            isOneToOne: false;
            referencedRelation: "coaches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "benchmarks_movement_id_fkey";
            columns: ["movement_id"];
            isOneToOne: false;
            referencedRelation: "movements";
            referencedColumns: ["id"];
          },
        ];
      };
      body_metrics: {
        Row: {
          athlete_id: string;
          body_fat_pct: number | null;
          coach_id: string;
          created_at: string;
          id: string;
          measured_on: string;
          notes: string | null;
          weight_kg: number | null;
        };
        ComputedFields: never;
        Insert: {
          athlete_id: string;
          body_fat_pct?: number | null;
          coach_id?: string;
          created_at?: string;
          id?: string;
          measured_on?: string;
          notes?: string | null;
          weight_kg?: number | null;
        };
        Update: {
          athlete_id?: string;
          body_fat_pct?: number | null;
          coach_id?: string;
          created_at?: string;
          id?: string;
          measured_on?: string;
          notes?: string | null;
          weight_kg?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "body_metrics_athlete_id_coach_id_fkey";
            columns: ["athlete_id", "coach_id"];
            isOneToOne: false;
            referencedRelation: "athletes";
            referencedColumns: ["id", "coach_id"];
          },
          {
            foreignKeyName: "body_metrics_coach_id_fkey";
            columns: ["coach_id"];
            isOneToOne: false;
            referencedRelation: "coaches";
            referencedColumns: ["id"];
          },
        ];
      };
      coaches: {
        Row: {
          created_at: string;
          full_name: string | null;
          gym_name: string | null;
          id: string;
          units: Database["public"]["Enums"]["weight_unit"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          full_name?: string | null;
          gym_name?: string | null;
          id: string;
          units?: Database["public"]["Enums"]["weight_unit"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          full_name?: string | null;
          gym_name?: string | null;
          id?: string;
          units?: Database["public"]["Enums"]["weight_unit"];
          updated_at?: string;
        };
        Relationships: [];
      };
      food_logs: {
        Row: {
          ai_suggestion_id: string | null;
          athlete_id: string;
          calories: number;
          carbs_g: number;
          coach_id: string;
          created_at: string;
          fat_g: number;
          food_name: string;
          id: string;
          logged_on: string;
          meal: Database["public"]["Enums"]["meal_type"];
          protein_g: number;
          serving: string | null;
          ingredients: string | null;
        };
        ComputedFields: never;
        Insert: {
          ai_suggestion_id?: string | null;
          athlete_id: string;
          calories?: number;
          carbs_g?: number;
          coach_id?: string;
          created_at?: string;
          fat_g?: number;
          food_name: string;
          id?: string;
          logged_on?: string;
          meal: Database["public"]["Enums"]["meal_type"];
          protein_g?: number;
          serving?: string | null;
          ingredients?: string | null;
        };
        Update: {
          ai_suggestion_id?: string | null;
          athlete_id?: string;
          calories?: number;
          carbs_g?: number;
          coach_id?: string;
          created_at?: string;
          fat_g?: number;
          food_name?: string;
          id?: string;
          logged_on?: string;
          meal?: Database["public"]["Enums"]["meal_type"];
          protein_g?: number;
          serving?: string | null;
          ingredients?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "food_logs_ai_suggestion_id_fkey";
            columns: ["ai_suggestion_id"];
            isOneToOne: false;
            referencedRelation: "ai_suggestions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "food_logs_athlete_id_coach_id_fkey";
            columns: ["athlete_id", "coach_id"];
            isOneToOne: false;
            referencedRelation: "athletes";
            referencedColumns: ["id", "coach_id"];
          },
          {
            foreignKeyName: "food_logs_coach_id_fkey";
            columns: ["coach_id"];
            isOneToOne: false;
            referencedRelation: "coaches";
            referencedColumns: ["id"];
          },
        ];
      };
      saved_foods: {
        Row: {
          id: string;
          athlete_id: string;
          coach_id: string;
          kind: string;
          is_favorite: boolean;
          name: string;
          brand: string | null;
          serving_label: string;
          calories: number;
          protein_g: number;
          carbs_g: number;
          fat_g: number;
          ingredients: string | null;
          source: string;
          source_id: string | null;
          created_at: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          athlete_id: string;
          coach_id?: string;
          kind: string;
          is_favorite?: boolean;
          name: string;
          brand?: string | null;
          serving_label: string;
          calories: number;
          protein_g: number;
          carbs_g: number;
          fat_g: number;
          ingredients?: string | null;
          source: string;
          source_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          athlete_id?: string;
          coach_id?: string;
          kind?: string;
          is_favorite?: boolean;
          name?: string;
          brand?: string | null;
          serving_label?: string;
          calories?: number;
          protein_g?: number;
          carbs_g?: number;
          fat_g?: number;
          ingredients?: string | null;
          source?: string;
          source_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "saved_foods_athlete_id_coach_id_fkey";
            columns: ["athlete_id", "coach_id"];
            isOneToOne: false;
            referencedRelation: "athletes";
            referencedColumns: ["id", "coach_id"];
          },
          {
            foreignKeyName: "saved_foods_coach_id_fkey";
            columns: ["coach_id"];
            isOneToOne: false;
            referencedRelation: "coaches";
            referencedColumns: ["id"];
          },
        ];
      };
      goals: {
        Row: {
          achieved_at: string | null;
          athlete_id: string;
          coach_id: string;
          created_at: string;
          goal_type: Database["public"]["Enums"]["goal_type"];
          id: string;
          metric: string | null;
          movement_id: string | null;
          start_value: number | null;
          status: Database["public"]["Enums"]["goal_status"];
          target_date: string | null;
          target_value: number | null;
          title: string;
          unit: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          achieved_at?: string | null;
          athlete_id: string;
          coach_id?: string;
          created_at?: string;
          goal_type: Database["public"]["Enums"]["goal_type"];
          id?: string;
          metric?: string | null;
          movement_id?: string | null;
          start_value?: number | null;
          status?: Database["public"]["Enums"]["goal_status"];
          target_date?: string | null;
          target_value?: number | null;
          title: string;
          unit?: string | null;
          updated_at?: string;
        };
        Update: {
          achieved_at?: string | null;
          athlete_id?: string;
          coach_id?: string;
          created_at?: string;
          goal_type?: Database["public"]["Enums"]["goal_type"];
          id?: string;
          metric?: string | null;
          movement_id?: string | null;
          start_value?: number | null;
          status?: Database["public"]["Enums"]["goal_status"];
          target_date?: string | null;
          target_value?: number | null;
          title?: string;
          unit?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goals_athlete_id_coach_id_fkey";
            columns: ["athlete_id", "coach_id"];
            isOneToOne: false;
            referencedRelation: "athletes";
            referencedColumns: ["id", "coach_id"];
          },
          {
            foreignKeyName: "goals_coach_id_fkey";
            columns: ["coach_id"];
            isOneToOne: false;
            referencedRelation: "coaches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goals_movement_id_fkey";
            columns: ["movement_id"];
            isOneToOne: false;
            referencedRelation: "movements";
            referencedColumns: ["id"];
          },
        ];
      };
      movement_guides: {
        Row: {
          id: string;
          coach_id: string;
          movement_id: string;
          video_url: string | null;
          cues: string[];
          common_mistakes: string[];
          easier_versions: string[];
          harder_versions: string[];
          ai_suggestion_id: string | null;
          created_at: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          coach_id?: string;
          movement_id: string;
          video_url?: string | null;
          cues?: string[];
          common_mistakes?: string[];
          easier_versions?: string[];
          harder_versions?: string[];
          ai_suggestion_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          coach_id?: string;
          movement_id?: string;
          video_url?: string | null;
          cues?: string[];
          common_mistakes?: string[];
          easier_versions?: string[];
          harder_versions?: string[];
          ai_suggestion_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: "movement_guides_coach_id_fkey"; columns: ["coach_id"]; isOneToOne: false; referencedRelation: "coaches"; referencedColumns: ["id"] },
          { foreignKeyName: "movement_guides_movement_id_fkey"; columns: ["movement_id"]; isOneToOne: false; referencedRelation: "movements"; referencedColumns: ["id"] },
          { foreignKeyName: "movement_guides_ai_suggestion_id_fkey"; columns: ["ai_suggestion_id"]; isOneToOne: false; referencedRelation: "ai_suggestions"; referencedColumns: ["id"] },
        ];
      };
      movements: {
        Row: {
          category: Database["public"]["Enums"]["movement_category"];
          coach_id: string | null;
          created_at: string;
          id: string;
          measure: Database["public"]["Enums"]["movement_measure"];
          demo_video_url: string | null;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          category: Database["public"]["Enums"]["movement_category"];
          coach_id?: string | null;
          created_at?: string;
          id?: string;
          measure?: Database["public"]["Enums"]["movement_measure"];
          demo_video_url?: string | null;
          name: string;
        };
        Update: {
          category?: Database["public"]["Enums"]["movement_category"];
          coach_id?: string | null;
          created_at?: string;
          id?: string;
          measure?: Database["public"]["Enums"]["movement_measure"];
          demo_video_url?: string | null;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "movements_coach_id_fkey";
            columns: ["coach_id"];
            isOneToOne: false;
            referencedRelation: "coaches";
            referencedColumns: ["id"];
          },
        ];
      };
      nutrition_targets: {
        Row: {
          athlete_id: string;
          calories: number;
          carbs_g: number;
          coach_id: string;
          created_at: string;
          end_date: string | null;
          fat_g: number;
          id: string;
          notes: string | null;
          protein_g: number;
          start_date: string;
        };
        ComputedFields: never;
        Insert: {
          athlete_id: string;
          calories: number;
          carbs_g: number;
          coach_id?: string;
          created_at?: string;
          end_date?: string | null;
          fat_g: number;
          id?: string;
          notes?: string | null;
          protein_g: number;
          start_date?: string;
        };
        Update: {
          athlete_id?: string;
          calories?: number;
          carbs_g?: number;
          coach_id?: string;
          created_at?: string;
          end_date?: string | null;
          fat_g?: number;
          id?: string;
          notes?: string | null;
          protein_g?: number;
          start_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "nutrition_targets_athlete_id_coach_id_fkey";
            columns: ["athlete_id", "coach_id"];
            isOneToOne: false;
            referencedRelation: "athletes";
            referencedColumns: ["id", "coach_id"];
          },
          {
            foreignKeyName: "nutrition_targets_coach_id_fkey";
            columns: ["coach_id"];
            isOneToOne: false;
            referencedRelation: "coaches";
            referencedColumns: ["id"];
          },
        ];
      };
      program_assignments: {
        Row: {
          athlete_id: string;
          coach_id: string;
          created_at: string;
          id: string;
          program_id: string;
          start_date: string;
        };
        ComputedFields: never;
        Insert: {
          athlete_id: string;
          coach_id?: string;
          created_at?: string;
          id?: string;
          program_id: string;
          start_date: string;
        };
        Update: {
          athlete_id?: string;
          coach_id?: string;
          created_at?: string;
          id?: string;
          program_id?: string;
          start_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "program_assignments_athlete_id_coach_id_fkey";
            columns: ["athlete_id", "coach_id"];
            isOneToOne: false;
            referencedRelation: "athletes";
            referencedColumns: ["id", "coach_id"];
          },
          {
            foreignKeyName: "program_assignments_coach_id_fkey";
            columns: ["coach_id"];
            isOneToOne: false;
            referencedRelation: "coaches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "program_assignments_program_id_coach_id_fkey";
            columns: ["program_id", "coach_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id", "coach_id"];
          },
        ];
      };
      programs: {
        Row: {
          athlete_id: string | null;
          coach_id: string;
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          source_program_id: string | null;
          updated_at: string;
          weeks: number;
        };
        ComputedFields: never;
        Insert: {
          athlete_id?: string | null;
          coach_id?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          source_program_id?: string | null;
          updated_at?: string;
          weeks?: number;
        };
        Update: {
          athlete_id?: string | null;
          coach_id?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          source_program_id?: string | null;
          updated_at?: string;
          weeks?: number;
        };
        Relationships: [
          {
            foreignKeyName: "programs_athlete_id_coach_id_fkey";
            columns: ["athlete_id", "coach_id"];
            isOneToOne: false;
            referencedRelation: "athletes";
            referencedColumns: ["id", "coach_id"];
          },
          {
            foreignKeyName: "programs_coach_id_fkey";
            columns: ["coach_id"];
            isOneToOne: false;
            referencedRelation: "coaches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "programs_source_program_id_fkey";
            columns: ["source_program_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id"];
          },
        ];
      };
      workout_movements: {
        Row: {
          calories: number | null;
          coach_id: string;
          distance_m: number | null;
          duration_seconds: number | null;
          id: string;
          load_kg: number | null;
          movement_id: string;
          notes: string | null;
          position: number;
          reps: number | null;
          sets: number | null;
          workout_id: string;
        };
        ComputedFields: never;
        Insert: {
          calories?: number | null;
          coach_id?: string;
          distance_m?: number | null;
          duration_seconds?: number | null;
          id?: string;
          load_kg?: number | null;
          movement_id: string;
          notes?: string | null;
          position?: number;
          reps?: number | null;
          sets?: number | null;
          workout_id: string;
        };
        Update: {
          calories?: number | null;
          coach_id?: string;
          distance_m?: number | null;
          duration_seconds?: number | null;
          id?: string;
          load_kg?: number | null;
          movement_id?: string;
          notes?: string | null;
          position?: number;
          reps?: number | null;
          sets?: number | null;
          workout_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_movements_coach_id_fkey";
            columns: ["coach_id"];
            isOneToOne: false;
            referencedRelation: "coaches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_movements_movement_id_fkey";
            columns: ["movement_id"];
            isOneToOne: false;
            referencedRelation: "movements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_movements_workout_id_coach_id_fkey";
            columns: ["workout_id", "coach_id"];
            isOneToOne: false;
            referencedRelation: "workouts";
            referencedColumns: ["id", "coach_id"];
          },
        ];
      };
      workout_results: {
        Row: {
          athlete_id: string;
          coach_id: string;
          created_at: string;
          id: string;
          is_rx: boolean;
          energy: number | null;
          load_kg: number | null;
          logged_by: string | null;
          notes: string | null;
          pain_notes: string | null;
          performed_on: string;
          rpe: number | null;
          reps: number | null;
          rounds: number | null;
          sleep_hours: number | null;
          soreness: number | null;
          time_seconds: number | null;
          updated_at: string | null;
          workout_id: string;
        };
        ComputedFields: never;
        Insert: {
          athlete_id: string;
          coach_id?: string;
          created_at?: string;
          id?: string;
          is_rx?: boolean;
          energy?: number | null;
          load_kg?: number | null;
          logged_by?: string | null;
          notes?: string | null;
          pain_notes?: string | null;
          performed_on?: string;
          rpe?: number | null;
          reps?: number | null;
          rounds?: number | null;
          sleep_hours?: number | null;
          soreness?: number | null;
          time_seconds?: number | null;
          updated_at?: string | null;
          workout_id: string;
        };
        Update: {
          athlete_id?: string;
          coach_id?: string;
          created_at?: string;
          id?: string;
          is_rx?: boolean;
          energy?: number | null;
          load_kg?: number | null;
          logged_by?: string | null;
          notes?: string | null;
          pain_notes?: string | null;
          performed_on?: string;
          rpe?: number | null;
          reps?: number | null;
          rounds?: number | null;
          sleep_hours?: number | null;
          soreness?: number | null;
          time_seconds?: number | null;
          updated_at?: string | null;
          workout_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workout_results_athlete_id_coach_id_fkey";
            columns: ["athlete_id", "coach_id"];
            isOneToOne: false;
            referencedRelation: "athletes";
            referencedColumns: ["id", "coach_id"];
          },
          {
            foreignKeyName: "workout_results_coach_id_fkey";
            columns: ["coach_id"];
            isOneToOne: false;
            referencedRelation: "coaches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workout_results_workout_id_coach_id_fkey";
            columns: ["workout_id", "coach_id"];
            isOneToOne: false;
            referencedRelation: "workouts";
            referencedColumns: ["id", "coach_id"];
          },
        ];
      };
      workouts: {
        Row: {
          athlete_id: string | null;
          coach_id: string;
          created_at: string;
          day_number: number | null;
          description: string | null;
          id: string;
          notes: string | null;
          program_id: string | null;
          rounds: number | null;
          scheduled_on: string | null;
          source_workout_id: string | null;
          time_cap_seconds: number | null;
          title: string;
          updated_at: string;
          week_number: number | null;
          workout_type: Database["public"]["Enums"]["workout_type"];
        };
        ComputedFields: never;
        Insert: {
          athlete_id?: string | null;
          coach_id?: string;
          created_at?: string;
          day_number?: number | null;
          description?: string | null;
          id?: string;
          notes?: string | null;
          program_id?: string | null;
          rounds?: number | null;
          scheduled_on?: string | null;
          source_workout_id?: string | null;
          time_cap_seconds?: number | null;
          title: string;
          updated_at?: string;
          week_number?: number | null;
          workout_type: Database["public"]["Enums"]["workout_type"];
        };
        Update: {
          athlete_id?: string | null;
          coach_id?: string;
          created_at?: string;
          day_number?: number | null;
          description?: string | null;
          id?: string;
          notes?: string | null;
          program_id?: string | null;
          rounds?: number | null;
          scheduled_on?: string | null;
          source_workout_id?: string | null;
          time_cap_seconds?: number | null;
          title?: string;
          updated_at?: string;
          week_number?: number | null;
          workout_type?: Database["public"]["Enums"]["workout_type"];
        };
        Relationships: [
          {
            foreignKeyName: "workouts_athlete_id_coach_id_fkey";
            columns: ["athlete_id", "coach_id"];
            isOneToOne: false;
            referencedRelation: "athletes";
            referencedColumns: ["id", "coach_id"];
          },
          {
            foreignKeyName: "workouts_coach_id_fkey";
            columns: ["coach_id"];
            isOneToOne: false;
            referencedRelation: "coaches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workouts_program_id_coach_id_fkey";
            columns: ["program_id", "coach_id"];
            isOneToOne: false;
            referencedRelation: "programs";
            referencedColumns: ["id", "coach_id"];
          },
          {
            foreignKeyName: "workouts_source_workout_id_fkey";
            columns: ["source_workout_id"];
            isOneToOne: false;
            referencedRelation: "workouts";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      apply_draft_program: { Args: { p_athlete_id: string; p_program: Json; p_today: string }; Returns: string };
      save_athlete_intake_step: { Args: { p_athlete_id: string; p_step: number; p_data: Json; p_today: string }; Returns: undefined };
      request_linked_athlete_intake: { Args: Record<PropertyKey, never>; Returns: unknown };
      create_notification: {
        Args: { p_athlete_id: string; p_kind: string; p_title: string; p_body?: string | null; p_link?: string | null; p_dedupe_key?: string | null };
        Returns: undefined;
      };
      copy_workout_for_athlete: { Args: { p_workout_id: string; p_athlete_id: string; p_scheduled_on: string }; Returns: string };
      override_workout_for_athlete: { Args: { p_workout_id: string; p_athlete_id: string; p_mode: string }; Returns: string | null };
      restore_workout_for_athlete: { Args: { p_workout_id: string; p_athlete_id: string }; Returns: undefined };
      delete_athlete_workout: { Args: { p_workout_id: string; p_athlete_id: string }; Returns: undefined };
      apply_athlete_workout_adjustment: {
        Args: { p_details: Json; p_modifications: string; p_proposal: Json; p_suggestion_id: string };
        Returns: string;
      };
      athlete_can_view_workout: {
        Args: { p_workout_id: string };
        Returns: boolean;
      };
      start_athlete_workout_adjustment: {
        Args: { p_input: Json; p_model: string; p_workout_id: string };
        Returns: string;
      };
      fail_athlete_workout_adjustment: {
        Args: { p_error: string; p_proposal?: Json; p_suggestion_id: string };
        Returns: undefined;
      };
      copy_program_for_athlete: {
        Args: {
          p_athlete_id: string;
          p_program_id: string;
          p_start_date?: string | null;
        };
        Returns: string;
      };
      save_ai_workout: {
        Args: {
          p_athlete_id?: string | null;
          p_expected_updated_at?: string | null;
          p_movements: Json;
          p_scheduled_on?: string | null;
          p_workout: Json;
          p_workout_id: string | null;
        };
        Returns: string;
      };
      claim_athlete_invite: {
        Args: { p_token: string };
        Returns: undefined;
      };
      clear_demo_data: { Args: Record<PropertyKey, never>; Returns: undefined };
      current_athlete_coach_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      current_athlete_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      get_invite: {
        Args: { p_token: string };
        Returns: {
          athlete_first_name: string;
          coach_full_name: string;
          email: string;
          gym_name: string;
        }[];
      };
      load_demo_data: { Args: { reset?: boolean }; Returns: Json };
      load_demo_data_unscored: { Args: { reset?: boolean }; Returns: Json };
    };
    Enums: {
      athlete_status: "active" | "archived";
      benchmark_kind: "girl" | "hero" | "lift" | "custom";
      experience_level: "beginner" | "intermediate" | "advanced" | "competitor";
      goal_status: "active" | "achieved" | "abandoned";
      goal_type: "performance" | "body_composition" | "skill";
      meal_type: "breakfast" | "lunch" | "dinner" | "snack";
      movement_category:
        "weightlifting" | "gymnastics" | "monostructural" | "other";
      movement_measure: "reps" | "load" | "distance" | "calories" | "time";
      suggestion_status:
        | "pending"
        | "approved"
        | "edited"
        | "rejected"
        | "failed"
        | "idea";
      suggestion_type:
        | "write_workout"
        | "scale_workout"
        | "adjust_macros"
        | "progress_summary"
        | "movement_guide"
        | "athlete_adjust_workout"
        | "suggest_food"
        | "draft_program";
      weight_unit: "lb" | "kg";
      workout_type: "for_time" | "amrap" | "emom" | "strength" | "other";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      athlete_status: ["active", "archived"],
      benchmark_kind: ["girl", "hero", "lift", "custom"],
      experience_level: ["beginner", "intermediate", "advanced", "competitor"],
      goal_status: ["active", "achieved", "abandoned"],
      goal_type: ["performance", "body_composition", "skill"],
      meal_type: ["breakfast", "lunch", "dinner", "snack"],
      movement_category: [
        "weightlifting",
        "gymnastics",
        "monostructural",
        "other",
      ],
      movement_measure: ["reps", "load", "distance", "calories", "time"],
      suggestion_status: [
        "pending",
        "approved",
        "edited",
        "rejected",
        "failed",
        "idea",
      ],
      suggestion_type: [
        "movement_guide",
        "write_workout",
        "scale_workout",
        "adjust_macros",
        "progress_summary",
        "athlete_adjust_workout",
        "suggest_food",
        "draft_program",
      ],
      weight_unit: ["lb", "kg"],
      workout_type: ["for_time", "amrap", "emom", "strength", "other"],
    },
  },
} as const;
