
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "ai_activity_draft_requests": {
                  Row: {
                    "created_at": string,"id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ai_chat_messages": {
                  Row: {
                    "cleared": boolean,"coach_id": string,"content": string,"context": Json | null,"created_at": string,"id": string,"role": string,"suggestion_ids": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "cleared"?: boolean,"coach_id"?: string,"content": string,"context"?: Json | null,"created_at"?: string,"id"?: string,"role": string,"suggestion_ids"?: (string)[]
                  }
                  Update: {
                    "cleared"?: boolean,"coach_id"?: string,"content"?: string,"context"?: Json | null,"created_at"?: string,"id"?: string,"role"?: string,"suggestion_ids"?: (string)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_chat_messages_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_suggestions": {
                  Row: {
                    "athlete_id": string | null,"coach_id": string,"coach_reviewed_at": string | null,"created_at": string,"decided_at": string | null,"error": string | null,"final": Json | null,"id": string,"input": NonNullable<Json>,"model": string | null,"proposal": Json | null,"requested_by": string | null,"status": Database["public"]['Enums']["suggestion_status"],"suggestion_type": Database["public"]['Enums']["suggestion_type"],"target_id": string | null,"target_table": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "athlete_id"?: string | null,"coach_id"?: string,"coach_reviewed_at"?: string | null,"created_at"?: string,"decided_at"?: string | null,"error"?: string | null,"final"?: Json | null,"id"?: string,"input"?: NonNullable<Json>,"model"?: string | null,"proposal"?: Json | null,"requested_by"?: string | null,"status"?: Database["public"]['Enums']["suggestion_status"],"suggestion_type": Database["public"]['Enums']["suggestion_type"],"target_id"?: string | null,"target_table"?: string | null
                  }
                  Update: {
                    "athlete_id"?: string | null,"coach_id"?: string,"coach_reviewed_at"?: string | null,"created_at"?: string,"decided_at"?: string | null,"error"?: string | null,"final"?: Json | null,"id"?: string,"input"?: NonNullable<Json>,"model"?: string | null,"proposal"?: Json | null,"requested_by"?: string | null,"status"?: Database["public"]['Enums']["suggestion_status"],"suggestion_type"?: Database["public"]['Enums']["suggestion_type"],"target_id"?: string | null,"target_table"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_suggestions_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "ai_suggestions_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"athlete_activities": {
                  Row: {
                    "activity_type": string,"athlete_id": string,"coach_id": string,"created_at": string,"created_by": string | null,"custom_label": string | null,"distance_m": number | null,"duration_minutes": number,"id": string,"notes": string | null,"performed_on": string,"rpe": number,"source": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_type": string,"athlete_id": string,"coach_id": string,"created_at"?: string,"created_by"?: string | null,"custom_label"?: string | null,"distance_m"?: number | null,"duration_minutes": number,"id"?: string,"notes"?: string | null,"performed_on": string,"rpe": number,"source": string,"updated_at"?: string
                  }
                  Update: {
                    "activity_type"?: string,"athlete_id"?: string,"coach_id"?: string,"created_at"?: string,"created_by"?: string | null,"custom_label"?: string | null,"distance_m"?: number | null,"duration_minutes"?: number,"id"?: string,"notes"?: string | null,"performed_on"?: string,"rpe"?: number,"source"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "athlete_activities_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "athlete_activities_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"athlete_ai_card_actions": {
                  Row: {
                    "action": string,"assistant_message_id": string,"athlete_id": string,"card_index": number,"coach_id": string,"created_at": string,"id": string,"ref_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"assistant_message_id": string,"athlete_id": string,"card_index": number,"coach_id": string,"created_at"?: string,"id"?: string,"ref_id": string
                  }
                  Update: {
                    "action"?: string,"assistant_message_id"?: string,"athlete_id"?: string,"card_index"?: number,"coach_id"?: string,"created_at"?: string,"id"?: string,"ref_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "athlete_ai_card_actions_assistant_message_id_fkey"
      columns: ["assistant_message_id"]
isOneToOne: false
      referencedRelation: "athlete_ai_messages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "athlete_ai_card_actions_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "athlete_ai_card_actions_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"athlete_ai_messages": {
                  Row: {
                    "athlete_id": string,"coach_id": string,"content": string,"created_at": string,"id": string,"metadata": NonNullable<Json>,"red_flag": boolean,"role": string
                  }
                  ComputedFields: never
                  Insert: {
                    "athlete_id": string,"coach_id": string,"content": string,"created_at"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"red_flag"?: boolean,"role": string
                  }
                  Update: {
                    "athlete_id"?: string,"coach_id"?: string,"content"?: string,"created_at"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"red_flag"?: boolean,"role"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "athlete_ai_messages_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "athlete_ai_messages_athlete_id_fkey"
      columns: ["athlete_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "athlete_ai_messages_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"athlete_assistant_applied_cards": {
                  Row: {
                    "applied_at": string,"athlete_id": string,"card_index": number,"coach_id": string,"message_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "applied_at"?: string,"athlete_id": string,"card_index": number,"coach_id": string,"message_id": string
                  }
                  Update: {
                    "applied_at"?: string,"athlete_id"?: string,"card_index"?: number,"coach_id"?: string,"message_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "athlete_assistant_applied_cards_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "athlete_assistant_applied_cards_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "athlete_assistant_applied_cards_message_id_fkey"
      columns: ["message_id"]
isOneToOne: false
      referencedRelation: "athlete_ai_messages"
      referencedColumns: ["id"]
    }
                  ]
                },"athlete_food_preferences": {
                  Row: {
                    "allergies": (string)[],"athlete_id": string,"coach_id": string,"cooking_minutes": number | null,"created_at": string,"diet_type": string,"dislikes": (string)[],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allergies"?: (string)[],"athlete_id": string,"coach_id": string,"cooking_minutes"?: number | null,"created_at"?: string,"diet_type"?: string,"dislikes"?: (string)[],"updated_at"?: string
                  }
                  Update: {
                    "allergies"?: (string)[],"athlete_id"?: string,"coach_id"?: string,"cooking_minutes"?: number | null,"created_at"?: string,"diet_type"?: string,"dislikes"?: (string)[],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "athlete_food_preferences_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "athlete_food_preferences_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"athlete_intakes": {
                  Row: {
                    "answers": NonNullable<Json>,"athlete_id": string,"coach_id": string,"completed_at": string | null,"created_at": string,"current_step": number,"id": string,"requested_at": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answers"?: NonNullable<Json>,"athlete_id": string,"coach_id": string,"completed_at"?: string | null,"created_at"?: string,"current_step"?: number,"id"?: string,"requested_at"?: string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "answers"?: NonNullable<Json>,"athlete_id"?: string,"coach_id"?: string,"completed_at"?: string | null,"created_at"?: string,"current_step"?: number,"id"?: string,"requested_at"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "athlete_intakes_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "athlete_intakes_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"athlete_invites": {
                  Row: {
                    "accepted_at": string | null,"athlete_id": string,"coach_id": string,"created_at": string,"email": string,"id": string,"revoked_at": string | null,"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"athlete_id": string,"coach_id"?: string,"created_at"?: string,"email": string,"id"?: string,"revoked_at"?: string | null,"token"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"athlete_id"?: string,"coach_id"?: string,"created_at"?: string,"email"?: string,"id"?: string,"revoked_at"?: string | null,"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "athlete_invites_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "athlete_invites_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"athlete_journal_entries": {
                  Row: {
                    "alcohol": boolean,"athlete_id": string,"coach_id": string,"created_at": string,"energy": number | null,"entry_on": string,"hit_water_goal": boolean,"id": string,"late_caffeine": boolean,"late_meal": boolean,"mobility": boolean,"mood": number | null,"notes": string | null,"readiness": number | null,"screens_in_bed": boolean,"sleep_hours": number | null,"sleep_quality": number | null,"soreness": number | null,"soreness_areas": (string)[],"stress": number | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alcohol"?: boolean,"athlete_id": string,"coach_id": string,"created_at"?: string,"energy"?: number | null,"entry_on"?: string,"hit_water_goal"?: boolean,"id"?: string,"late_caffeine"?: boolean,"late_meal"?: boolean,"mobility"?: boolean,"mood"?: number | null,"notes"?: string | null,"readiness"?: never,"screens_in_bed"?: boolean,"sleep_hours"?: number | null,"sleep_quality"?: number | null,"soreness"?: number | null,"soreness_areas"?: (string)[],"stress"?: number | null,"updated_at"?: string
                  }
                  Update: {
                    "alcohol"?: boolean,"athlete_id"?: string,"coach_id"?: string,"created_at"?: string,"energy"?: number | null,"entry_on"?: string,"hit_water_goal"?: boolean,"id"?: string,"late_caffeine"?: boolean,"late_meal"?: boolean,"mobility"?: boolean,"mood"?: number | null,"notes"?: string | null,"readiness"?: never,"screens_in_bed"?: boolean,"sleep_hours"?: number | null,"sleep_quality"?: number | null,"soreness"?: number | null,"soreness_areas"?: (string)[],"stress"?: number | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "athlete_journal_entries_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "athlete_journal_entries_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"athlete_memberships": {
                  Row: {
                    "athlete_id": string,"cancel_at_period_end": boolean,"coach_id": string,"created_at": string,"current_period_end": string | null,"id": string,"plan_id": string | null,"status": string,"stripe_customer_id": string,"stripe_subscription_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "athlete_id": string,"cancel_at_period_end"?: boolean,"coach_id": string,"created_at"?: string,"current_period_end"?: string | null,"id"?: string,"plan_id"?: string | null,"status": string,"stripe_customer_id": string,"stripe_subscription_id": string,"updated_at"?: string
                  }
                  Update: {
                    "athlete_id"?: string,"cancel_at_period_end"?: boolean,"coach_id"?: string,"created_at"?: string,"current_period_end"?: string | null,"id"?: string,"plan_id"?: string | null,"status"?: string,"stripe_customer_id"?: string,"stripe_subscription_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "athlete_memberships_athlete_id_fkey"
      columns: ["athlete_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "athlete_memberships_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "athlete_memberships_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "membership_plans"
      referencedColumns: ["id"]
    }
                  ]
                },"athlete_movement_cues": {
                  Row: {
                    "athlete_id": string,"coach_id": string,"cue": string,"movement_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "athlete_id": string,"coach_id": string,"cue": string,"movement_id": string,"updated_at"?: string
                  }
                  Update: {
                    "athlete_id"?: string,"coach_id"?: string,"cue"?: string,"movement_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "athlete_movement_cues_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "athlete_movement_cues_athlete_id_fkey"
      columns: ["athlete_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "athlete_movement_cues_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "athlete_movement_cues_movement_id_fkey"
      columns: ["movement_id"]
isOneToOne: false
      referencedRelation: "movements"
      referencedColumns: ["id"]
    }
                  ]
                },"athlete_stripe_customers": {
                  Row: {
                    "athlete_id": string,"coach_id": string,"created_at": string,"stripe_customer_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "athlete_id": string,"coach_id": string,"created_at"?: string,"stripe_customer_id": string
                  }
                  Update: {
                    "athlete_id"?: string,"coach_id"?: string,"created_at"?: string,"stripe_customer_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "athlete_stripe_customers_athlete_id_fkey"
      columns: ["athlete_id"]
isOneToOne: true
      referencedRelation: "athletes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "athlete_stripe_customers_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"athlete_waiver_signatures": {
                  Row: {
                    "athlete_id": string,"coach_id": string,"id": string,"signed_at": string,"signed_name": string,"user_agent": string | null,"user_id": string,"waiver_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "athlete_id": string,"coach_id": string,"id"?: string,"signed_at"?: string,"signed_name": string,"user_agent"?: string | null,"user_id"?: string,"waiver_id": string
                  }
                  Update: {
                    "athlete_id"?: string,"coach_id"?: string,"id"?: string,"signed_at"?: string,"signed_name"?: string,"user_agent"?: string | null,"user_id"?: string,"waiver_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "athlete_waiver_signatures_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "athlete_waiver_signatures_waiver_id_fkey"
      columns: ["waiver_id"]
isOneToOne: false
      referencedRelation: "coach_waivers"
      referencedColumns: ["id"]
    }
                  ]
                },"athlete_workout_overrides": {
                  Row: {
                    "athlete_id": string,"coach_id": string,"created_at": string,"id": string,"replacement_workout_id": string | null,"updated_at": string,"workout_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "athlete_id": string,"coach_id"?: string,"created_at"?: string,"id"?: string,"replacement_workout_id"?: string | null,"updated_at"?: string,"workout_id": string
                  }
                  Update: {
                    "athlete_id"?: string,"coach_id"?: string,"created_at"?: string,"id"?: string,"replacement_workout_id"?: string | null,"updated_at"?: string,"workout_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "athlete_workout_overrides_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "athlete_workout_overrides_replacement_workout_id_fkey"
      columns: ["replacement_workout_id"]
isOneToOne: true
      referencedRelation: "workouts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "athlete_workout_overrides_workout_id_fkey"
      columns: ["workout_id"]
isOneToOne: false
      referencedRelation: "workouts"
      referencedColumns: ["id"]
    }
                  ]
                },"athlete_workout_scalings": {
                  Row: {
                    "athlete_adjusted_at": string | null,"athlete_id": string,"athlete_suggestion_id": string | null,"coach_details": Json | null,"coach_id": string,"coach_modifications": string | null,"created_at": string,"details": Json | null,"id": string,"modifications": string,"updated_at": string,"workout_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "athlete_adjusted_at"?: string | null,"athlete_id": string,"athlete_suggestion_id"?: string | null,"coach_details"?: Json | null,"coach_id"?: string,"coach_modifications"?: string | null,"created_at"?: string,"details"?: Json | null,"id"?: string,"modifications": string,"updated_at"?: string,"workout_id": string
                  }
                  Update: {
                    "athlete_adjusted_at"?: string | null,"athlete_id"?: string,"athlete_suggestion_id"?: string | null,"coach_details"?: Json | null,"coach_id"?: string,"coach_modifications"?: string | null,"created_at"?: string,"details"?: Json | null,"id"?: string,"modifications"?: string,"updated_at"?: string,"workout_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "athlete_workout_scalings_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "athlete_workout_scalings_athlete_suggestion_id_fkey"
      columns: ["athlete_suggestion_id"]
isOneToOne: false
      referencedRelation: "ai_suggestions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "athlete_workout_scalings_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "athlete_workout_scalings_workout_id_coach_id_fkey"
      columns: ["workout_id","coach_id"]
isOneToOne: false
      referencedRelation: "workouts"
      referencedColumns: ["id","coach_id"]
    }
                  ]
                },"athletes": {
                  Row: {
                    "assigned_coach_id": string | null,"assistant_rules": string | null,"birth_date": string | null,"coach_id": string,"created_at": string,"email": string | null,"experience_level": Database["public"]['Enums']["experience_level"],"first_name": string,"height_cm": number | null,"id": string,"injuries": string | null,"last_name": string,"notes": string | null,"sex": string | null,"status": Database["public"]['Enums']["athlete_status"],"updated_at": string,"user_id": string | null,"waiver_requested_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_coach_id"?: string | null,"assistant_rules"?: string | null,"birth_date"?: string | null,"coach_id"?: string,"created_at"?: string,"email"?: string | null,"experience_level"?: Database["public"]['Enums']["experience_level"],"first_name": string,"height_cm"?: number | null,"id"?: string,"injuries"?: string | null,"last_name": string,"notes"?: string | null,"sex"?: string | null,"status"?: Database["public"]['Enums']["athlete_status"],"updated_at"?: string,"user_id"?: string | null,"waiver_requested_at"?: string | null
                  }
                  Update: {
                    "assigned_coach_id"?: string | null,"assistant_rules"?: string | null,"birth_date"?: string | null,"coach_id"?: string,"created_at"?: string,"email"?: string | null,"experience_level"?: Database["public"]['Enums']["experience_level"],"first_name"?: string,"height_cm"?: number | null,"id"?: string,"injuries"?: string | null,"last_name"?: string,"notes"?: string | null,"sex"?: string | null,"status"?: Database["public"]['Enums']["athlete_status"],"updated_at"?: string,"user_id"?: string | null,"waiver_requested_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "athletes_assigned_coach_id_fkey"
      columns: ["assigned_coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "athletes_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"attendance": {
                  Row: {
                    "athlete_id": string,"attended_on": string,"coach_id": string,"created_at": string,"created_by": string | null,"id": string,"kind": string,"note": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "athlete_id": string,"attended_on": string,"coach_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind": string,"note"?: string | null
                  }
                  Update: {
                    "athlete_id"?: string,"attended_on"?: string,"coach_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: string,"note"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "attendance_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "attendance_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"benchmark_results": {
                  Row: {
                    "athlete_id": string,"benchmark_id": string,"coach_id": string,"created_at": string,"id": string,"is_rx": boolean,"load_kg": number | null,"logged_by": string | null,"notes": string | null,"performed_on": string,"rep_max": number | null,"reps": number | null,"rounds": number | null,"time_seconds": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "athlete_id": string,"benchmark_id": string,"coach_id"?: string,"created_at"?: string,"id"?: string,"is_rx"?: boolean,"load_kg"?: number | null,"logged_by"?: string | null,"notes"?: string | null,"performed_on": string,"rep_max"?: number | null,"reps"?: number | null,"rounds"?: number | null,"time_seconds"?: number | null
                  }
                  Update: {
                    "athlete_id"?: string,"benchmark_id"?: string,"coach_id"?: string,"created_at"?: string,"id"?: string,"is_rx"?: boolean,"load_kg"?: number | null,"logged_by"?: string | null,"notes"?: string | null,"performed_on"?: string,"rep_max"?: number | null,"reps"?: number | null,"rounds"?: number | null,"time_seconds"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "benchmark_results_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "benchmark_results_benchmark_id_fkey"
      columns: ["benchmark_id"]
isOneToOne: false
      referencedRelation: "benchmarks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "benchmark_results_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"benchmark_settings": {
                  Row: {
                    "benchmark_id": string,"coach_id": string,"retest_weeks": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "benchmark_id": string,"coach_id"?: string,"retest_weeks"?: number | null
                  }
                  Update: {
                    "benchmark_id"?: string,"coach_id"?: string,"retest_weeks"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "benchmark_settings_benchmark_id_fkey"
      columns: ["benchmark_id"]
isOneToOne: false
      referencedRelation: "benchmarks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "benchmark_settings_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"benchmarks": {
                  Row: {
                    "coach_id": string | null,"created_at": string,"description": string | null,"id": string,"kind": Database["public"]['Enums']["benchmark_kind"],"movement_id": string | null,"name": string,"workout_type": Database["public"]['Enums']["workout_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "coach_id"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["benchmark_kind"],"movement_id"?: string | null,"name": string,"workout_type": Database["public"]['Enums']["workout_type"]
                  }
                  Update: {
                    "coach_id"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["benchmark_kind"],"movement_id"?: string | null,"name"?: string,"workout_type"?: Database["public"]['Enums']["workout_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "benchmarks_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "benchmarks_movement_id_fkey"
      columns: ["movement_id"]
isOneToOne: false
      referencedRelation: "movements"
      referencedColumns: ["id"]
    }
                  ]
                },"body_measurements": {
                  Row: {
                    "athlete_id": string,"coach_id": string,"created_at": string,"created_by": string | null,"id": string,"measured_on": string,"site": string,"updated_at": string,"value_cm": number
                  }
                  ComputedFields: never
                  Insert: {
                    "athlete_id": string,"coach_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"measured_on": string,"site": string,"updated_at"?: string,"value_cm": number
                  }
                  Update: {
                    "athlete_id"?: string,"coach_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"measured_on"?: string,"site"?: string,"updated_at"?: string,"value_cm"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "body_measurements_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "body_measurements_athlete_id_fkey"
      columns: ["athlete_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "body_measurements_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"body_metrics": {
                  Row: {
                    "athlete_id": string,"body_fat_pct": number | null,"coach_id": string,"created_at": string,"id": string,"measured_on": string,"notes": string | null,"weight_kg": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "athlete_id": string,"body_fat_pct"?: number | null,"coach_id"?: string,"created_at"?: string,"id"?: string,"measured_on"?: string,"notes"?: string | null,"weight_kg"?: number | null
                  }
                  Update: {
                    "athlete_id"?: string,"body_fat_pct"?: number | null,"coach_id"?: string,"created_at"?: string,"id"?: string,"measured_on"?: string,"notes"?: string | null,"weight_kg"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "body_metrics_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "body_metrics_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"check_in_reminder_sends": {
                  Row: {
                    "athlete_id": string,"local_date": string,"sent_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "athlete_id": string,"local_date": string,"sent_at"?: string
                  }
                  Update: {
                    "athlete_id"?: string,"local_date"?: string,"sent_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "check_in_reminder_sends_athlete_id_fkey"
      columns: ["athlete_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id"]
    }
                  ]
                },"check_in_reminders": {
                  Row: {
                    "athlete_id": string,"remind_at": string | null,"time_zone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "athlete_id": string,"remind_at"?: string | null,"time_zone": string,"updated_at"?: string
                  }
                  Update: {
                    "athlete_id"?: string,"remind_at"?: string | null,"time_zone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "check_in_reminders_athlete_id_fkey"
      columns: ["athlete_id"]
isOneToOne: true
      referencedRelation: "athletes"
      referencedColumns: ["id"]
    }
                  ]
                },"check_in_skips": {
                  Row: {
                    "athlete_id": string,"created_at": string,"skipped_on": string
                  }
                  ComputedFields: never
                  Insert: {
                    "athlete_id": string,"created_at"?: string,"skipped_on": string
                  }
                  Update: {
                    "athlete_id"?: string,"created_at"?: string,"skipped_on"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "check_in_skips_athlete_id_fkey"
      columns: ["athlete_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id"]
    }
                  ]
                },"coach_invites": {
                  Row: {
                    "accepted_at": string | null,"created_at": string | null,"email": string,"gym_id": string,"id": string,"invited_by": string | null,"revoked_at": string | null,"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"created_at"?: string | null,"email": string,"gym_id"?: string,"id"?: string,"invited_by"?: string | null,"revoked_at"?: string | null,"token"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"created_at"?: string | null,"email"?: string,"gym_id"?: string,"id"?: string,"invited_by"?: string | null,"revoked_at"?: string | null,"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "coach_invites_gym_id_fkey"
      columns: ["gym_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "coach_invites_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"coach_programming_styles": {
                  Row: {
                    "answers": NonNullable<Json>,"coach_id": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answers"?: NonNullable<Json>,"coach_id": string,"status": string,"updated_at"?: string
                  }
                  Update: {
                    "answers"?: NonNullable<Json>,"coach_id"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "coach_programming_styles_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: true
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"coach_stripe_accounts": {
                  Row: {
                    "charges_enabled": boolean,"coach_id": string,"created_at": string,"details_submitted": boolean,"portal_configuration_id": string | null,"stripe_account_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "charges_enabled"?: boolean,"coach_id": string,"created_at"?: string,"details_submitted"?: boolean,"portal_configuration_id"?: string | null,"stripe_account_id": string,"updated_at"?: string
                  }
                  Update: {
                    "charges_enabled"?: boolean,"coach_id"?: string,"created_at"?: string,"details_submitted"?: boolean,"portal_configuration_id"?: string | null,"stripe_account_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "coach_stripe_accounts_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: true
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"coach_waivers": {
                  Row: {
                    "body": string,"coach_id": string,"created_at": string,"created_by": string,"id": string,"requires_resign": boolean,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"coach_id": string,"created_at"?: string,"created_by"?: string,"id"?: string,"requires_resign"?: boolean,"version": number
                  }
                  Update: {
                    "body"?: string,"coach_id"?: string,"created_at"?: string,"created_by"?: string,"id"?: string,"requires_resign"?: boolean,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "coach_waivers_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"coaches": {
                  Row: {
                    "assistant_nutrition": boolean,"assistant_recovery": boolean,"assistant_rules": string | null,"assistant_training": boolean,"athlete_ai_daily_limit": number,"created_at": string,"drift_days": number,"full_name": string | null,"gym_id": string,"gym_name": string | null,"id": string,"load_warning_ratio": number,"units": Database["public"]['Enums']["weight_unit"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assistant_nutrition"?: boolean,"assistant_recovery"?: boolean,"assistant_rules"?: string | null,"assistant_training"?: boolean,"athlete_ai_daily_limit"?: number,"created_at"?: string,"drift_days"?: number,"full_name"?: string | null,"gym_id": string,"gym_name"?: string | null,"id": string,"load_warning_ratio"?: number,"units"?: Database["public"]['Enums']["weight_unit"],"updated_at"?: string
                  }
                  Update: {
                    "assistant_nutrition"?: boolean,"assistant_recovery"?: boolean,"assistant_rules"?: string | null,"assistant_training"?: boolean,"athlete_ai_daily_limit"?: number,"created_at"?: string,"drift_days"?: number,"full_name"?: string | null,"gym_id"?: string,"gym_name"?: string | null,"id"?: string,"load_warning_ratio"?: number,"units"?: Database["public"]['Enums']["weight_unit"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "coaches_gym_id_fkey"
      columns: ["gym_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"food_logs": {
                  Row: {
                    "ai_suggestion_id": string | null,"athlete_id": string,"calories": number,"carbs_g": number,"coach_id": string,"created_at": string,"fat_g": number,"food_name": string,"id": string,"ingredients": string | null,"logged_on": string,"meal": Database["public"]['Enums']["meal_type"],"protein_g": number,"serving": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_suggestion_id"?: string | null,"athlete_id": string,"calories"?: number,"carbs_g"?: number,"coach_id"?: string,"created_at"?: string,"fat_g"?: number,"food_name": string,"id"?: string,"ingredients"?: string | null,"logged_on"?: string,"meal": Database["public"]['Enums']["meal_type"],"protein_g"?: number,"serving"?: string | null
                  }
                  Update: {
                    "ai_suggestion_id"?: string | null,"athlete_id"?: string,"calories"?: number,"carbs_g"?: number,"coach_id"?: string,"created_at"?: string,"fat_g"?: number,"food_name"?: string,"id"?: string,"ingredients"?: string | null,"logged_on"?: string,"meal"?: Database["public"]['Enums']["meal_type"],"protein_g"?: number,"serving"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "food_logs_ai_suggestion_id_fkey"
      columns: ["ai_suggestion_id"]
isOneToOne: false
      referencedRelation: "ai_suggestions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "food_logs_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "food_logs_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"form_review_comments": {
                  Row: {
                    "at_seconds": number | null,"athlete_id": string,"author_id": string,"body": string,"coach_id": string,"created_at": string,"id": string,"parent_id": string | null,"review_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at_seconds"?: number | null,"athlete_id": string,"author_id"?: string,"body": string,"coach_id": string,"created_at"?: string,"id"?: string,"parent_id"?: string | null,"review_id": string,"updated_at"?: string
                  }
                  Update: {
                    "at_seconds"?: number | null,"athlete_id"?: string,"author_id"?: string,"body"?: string,"coach_id"?: string,"created_at"?: string,"id"?: string,"parent_id"?: string | null,"review_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "form_review_comments_parent_id_review_id_fkey"
      columns: ["parent_id","review_id"]
isOneToOne: false
      referencedRelation: "form_review_comments"
      referencedColumns: ["id","review_id"]
    },{
      foreignKeyName: "form_review_comments_review_id_athlete_id_coach_id_fkey"
      columns: ["review_id","athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "form_reviews"
      referencedColumns: ["id","athlete_id","coach_id"]
    }
                  ]
                },"form_reviews": {
                  Row: {
                    "athlete_id": string,"coach_id": string,"content_type": string,"created_at": string,"created_by": string | null,"duration_seconds": number,"id": string,"movement_id": string | null,"question": string | null,"recorded_on": string,"reviewed_at": string | null,"set_label": string | null,"size_bytes": number,"status": string,"storage_path": string,"updated_at": string,"workout_result_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "athlete_id": string,"coach_id": string,"content_type": string,"created_at"?: string,"created_by"?: string | null,"duration_seconds": number,"id"?: string,"movement_id"?: string | null,"question"?: string | null,"recorded_on": string,"reviewed_at"?: string | null,"set_label"?: string | null,"size_bytes": number,"status"?: string,"storage_path": string,"updated_at"?: string,"workout_result_id"?: string | null
                  }
                  Update: {
                    "athlete_id"?: string,"coach_id"?: string,"content_type"?: string,"created_at"?: string,"created_by"?: string | null,"duration_seconds"?: number,"id"?: string,"movement_id"?: string | null,"question"?: string | null,"recorded_on"?: string,"reviewed_at"?: string | null,"set_label"?: string | null,"size_bytes"?: number,"status"?: string,"storage_path"?: string,"updated_at"?: string,"workout_result_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "form_reviews_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "form_reviews_athlete_id_fkey"
      columns: ["athlete_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "form_reviews_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "form_reviews_movement_id_fkey"
      columns: ["movement_id"]
isOneToOne: false
      referencedRelation: "movements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "form_reviews_workout_result_id_fkey"
      columns: ["workout_result_id"]
isOneToOne: false
      referencedRelation: "workout_results"
      referencedColumns: ["id"]
    }
                  ]
                },"goals": {
                  Row: {
                    "achieved_at": string | null,"athlete_id": string,"coach_id": string,"created_at": string,"goal_type": Database["public"]['Enums']["goal_type"],"id": string,"metric": string | null,"movement_id": string | null,"start_value": number | null,"status": Database["public"]['Enums']["goal_status"],"target_date": string | null,"target_value": number | null,"title": string,"unit": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "achieved_at"?: string | null,"athlete_id": string,"coach_id"?: string,"created_at"?: string,"goal_type": Database["public"]['Enums']["goal_type"],"id"?: string,"metric"?: string | null,"movement_id"?: string | null,"start_value"?: number | null,"status"?: Database["public"]['Enums']["goal_status"],"target_date"?: string | null,"target_value"?: number | null,"title": string,"unit"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "achieved_at"?: string | null,"athlete_id"?: string,"coach_id"?: string,"created_at"?: string,"goal_type"?: Database["public"]['Enums']["goal_type"],"id"?: string,"metric"?: string | null,"movement_id"?: string | null,"start_value"?: number | null,"status"?: Database["public"]['Enums']["goal_status"],"target_date"?: string | null,"target_value"?: number | null,"title"?: string,"unit"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "goals_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "goals_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "goals_movement_id_fkey"
      columns: ["movement_id"]
isOneToOne: false
      referencedRelation: "movements"
      referencedColumns: ["id"]
    }
                  ]
                },"membership_plans": {
                  Row: {
                    "active": boolean,"amount_cents": number,"coach_id": string,"created_at": string,"currency": string,"id": string,"interval": string,"name": string,"stripe_price_id": string,"stripe_product_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"amount_cents": number,"coach_id": string,"created_at"?: string,"currency"?: string,"id"?: string,"interval": string,"name": string,"stripe_price_id": string,"stripe_product_id": string
                  }
                  Update: {
                    "active"?: boolean,"amount_cents"?: number,"coach_id"?: string,"created_at"?: string,"currency"?: string,"id"?: string,"interval"?: string,"name"?: string,"stripe_price_id"?: string,"stripe_product_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "membership_plans_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"messages": {
                  Row: {
                    "athlete_id": string,"body": string,"coach_id": string,"created_at": string,"id": string,"link_id": string | null,"link_type": string | null,"read_at": string | null,"sender_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "athlete_id": string,"body": string,"coach_id": string,"created_at"?: string,"id"?: string,"link_id"?: string | null,"link_type"?: string | null,"read_at"?: string | null,"sender_id"?: string
                  }
                  Update: {
                    "athlete_id"?: string,"body"?: string,"coach_id"?: string,"created_at"?: string,"id"?: string,"link_id"?: string | null,"link_type"?: string | null,"read_at"?: string | null,"sender_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_athlete_id_fkey"
      columns: ["athlete_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "messages_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"movement_guides": {
                  Row: {
                    "ai_suggestion_id": string | null,"clip_path": string | null,"coach_id": string,"common_mistakes": (string)[],"created_at": string,"cues": (string)[],"easier_movement_id": string | null,"easier_versions": (string)[],"harder_movement_id": string | null,"harder_versions": (string)[],"id": string,"movement_id": string,"updated_at": string,"video_url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_suggestion_id"?: string | null,"clip_path"?: string | null,"coach_id"?: string,"common_mistakes"?: (string)[],"created_at"?: string,"cues"?: (string)[],"easier_movement_id"?: string | null,"easier_versions"?: (string)[],"harder_movement_id"?: string | null,"harder_versions"?: (string)[],"id"?: string,"movement_id": string,"updated_at"?: string,"video_url"?: string | null
                  }
                  Update: {
                    "ai_suggestion_id"?: string | null,"clip_path"?: string | null,"coach_id"?: string,"common_mistakes"?: (string)[],"created_at"?: string,"cues"?: (string)[],"easier_movement_id"?: string | null,"easier_versions"?: (string)[],"harder_movement_id"?: string | null,"harder_versions"?: (string)[],"id"?: string,"movement_id"?: string,"updated_at"?: string,"video_url"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "movement_guides_ai_suggestion_id_fkey"
      columns: ["ai_suggestion_id"]
isOneToOne: false
      referencedRelation: "ai_suggestions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movement_guides_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movement_guides_easier_movement_id_fkey"
      columns: ["easier_movement_id"]
isOneToOne: false
      referencedRelation: "movements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movement_guides_harder_movement_id_fkey"
      columns: ["harder_movement_id"]
isOneToOne: false
      referencedRelation: "movements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movement_guides_movement_id_fkey"
      columns: ["movement_id"]
isOneToOne: false
      referencedRelation: "movements"
      referencedColumns: ["id"]
    }
                  ]
                },"movements": {
                  Row: {
                    "category": Database["public"]['Enums']["movement_category"],"coach_id": string | null,"created_at": string,"demo_common_faults": (string)[],"demo_cues": (string)[],"demo_video_url": string | null,"easier_movement_id": string | null,"harder_movement_id": string | null,"id": string,"measure": Database["public"]['Enums']["movement_measure"],"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": Database["public"]['Enums']["movement_category"],"coach_id"?: string | null,"created_at"?: string,"demo_common_faults"?: (string)[],"demo_cues"?: (string)[],"demo_video_url"?: string | null,"easier_movement_id"?: string | null,"harder_movement_id"?: string | null,"id"?: string,"measure"?: Database["public"]['Enums']["movement_measure"],"name": string
                  }
                  Update: {
                    "category"?: Database["public"]['Enums']["movement_category"],"coach_id"?: string | null,"created_at"?: string,"demo_common_faults"?: (string)[],"demo_cues"?: (string)[],"demo_video_url"?: string | null,"easier_movement_id"?: string | null,"harder_movement_id"?: string | null,"id"?: string,"measure"?: Database["public"]['Enums']["movement_measure"],"name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "movements_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movements_easier_movement_id_fkey"
      columns: ["easier_movement_id"]
isOneToOne: false
      referencedRelation: "movements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "movements_harder_movement_id_fkey"
      columns: ["harder_movement_id"]
isOneToOne: false
      referencedRelation: "movements"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_settings": {
                  Row: {
                    "email_enabled": boolean,"email_frequency": string,"push_categories": (string)[],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "email_enabled"?: boolean,"email_frequency"?: string,"push_categories"?: (string)[],"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "email_enabled"?: boolean,"email_frequency"?: string,"push_categories"?: (string)[],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notifications": {
                  Row: {
                    "athlete_id": string | null,"body": string | null,"created_at": string,"dedupe_key": string | null,"emailed_at": string | null,"id": string,"kind": string,"link": string | null,"pushed_at": string | null,"read_at": string | null,"recipient_id": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "athlete_id"?: string | null,"body"?: string | null,"created_at"?: string,"dedupe_key"?: string | null,"emailed_at"?: string | null,"id"?: string,"kind": string,"link"?: string | null,"pushed_at"?: string | null,"read_at"?: string | null,"recipient_id": string,"title": string
                  }
                  Update: {
                    "athlete_id"?: string | null,"body"?: string | null,"created_at"?: string,"dedupe_key"?: string | null,"emailed_at"?: string | null,"id"?: string,"kind"?: string,"link"?: string | null,"pushed_at"?: string | null,"read_at"?: string | null,"recipient_id"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_athlete_id_fkey"
      columns: ["athlete_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id"]
    }
                  ]
                },"nutrition_targets": {
                  Row: {
                    "athlete_id": string,"calories": number,"carbs_g": number,"coach_id": string,"created_at": string,"end_date": string | null,"fat_g": number,"id": string,"notes": string | null,"protein_g": number,"start_date": string
                  }
                  ComputedFields: never
                  Insert: {
                    "athlete_id": string,"calories": number,"carbs_g": number,"coach_id"?: string,"created_at"?: string,"end_date"?: string | null,"fat_g": number,"id"?: string,"notes"?: string | null,"protein_g": number,"start_date"?: string
                  }
                  Update: {
                    "athlete_id"?: string,"calories"?: number,"carbs_g"?: number,"coach_id"?: string,"created_at"?: string,"end_date"?: string | null,"fat_g"?: number,"id"?: string,"notes"?: string | null,"protein_g"?: number,"start_date"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "nutrition_targets_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "nutrition_targets_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"program_assignments": {
                  Row: {
                    "athlete_id": string,"coach_id": string,"created_at": string,"id": string,"program_id": string,"start_date": string
                  }
                  ComputedFields: never
                  Insert: {
                    "athlete_id": string,"coach_id"?: string,"created_at"?: string,"id"?: string,"program_id": string,"start_date": string
                  }
                  Update: {
                    "athlete_id"?: string,"coach_id"?: string,"created_at"?: string,"id"?: string,"program_id"?: string,"start_date"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "program_assignments_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "program_assignments_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "program_assignments_program_id_coach_id_fkey"
      columns: ["program_id","coach_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id","coach_id"]
    }
                  ]
                },"programs": {
                  Row: {
                    "athlete_id": string | null,"coach_id": string,"created_at": string,"description": string | null,"id": string,"name": string,"source_program_id": string | null,"updated_at": string,"weeks": number
                  }
                  ComputedFields: never
                  Insert: {
                    "athlete_id"?: string | null,"coach_id"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"name": string,"source_program_id"?: string | null,"updated_at"?: string,"weeks"?: number
                  }
                  Update: {
                    "athlete_id"?: string | null,"coach_id"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"name"?: string,"source_program_id"?: string | null,"updated_at"?: string,"weeks"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "programs_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "programs_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "programs_source_program_id_fkey"
      columns: ["source_program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    }
                  ]
                },"progress_photos": {
                  Row: {
                    "athlete_id": string,"coach_id": string,"created_at": string,"created_by": string | null,"id": string,"pose": string,"storage_path": string,"taken_on": string
                  }
                  ComputedFields: never
                  Insert: {
                    "athlete_id": string,"coach_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"pose": string,"storage_path": string,"taken_on": string
                  }
                  Update: {
                    "athlete_id"?: string,"coach_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"pose"?: string,"storage_path"?: string,"taken_on"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "progress_photos_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "progress_photos_athlete_id_fkey"
      columns: ["athlete_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "progress_photos_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"progress_reminders": {
                  Row: {
                    "athlete_id": string,"cadence_weeks": number,"coach_id": string,"starts_on": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "athlete_id": string,"cadence_weeks": number,"coach_id": string,"starts_on": string,"updated_at"?: string
                  }
                  Update: {
                    "athlete_id"?: string,"cadence_weeks"?: number,"coach_id"?: string,"starts_on"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "progress_reminders_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "progress_reminders_athlete_id_fkey"
      columns: ["athlete_id"]
isOneToOne: true
      referencedRelation: "athletes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "progress_reminders_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string | null,"endpoint": string,"id": string,"last_used_at": string | null,"p256dh": string,"user_agent": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string | null,"endpoint": string,"id"?: string,"last_used_at"?: string | null,"p256dh": string,"user_agent"?: string | null,"user_id"?: string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string | null,"endpoint"?: string,"id"?: string,"last_used_at"?: string | null,"p256dh"?: string,"user_agent"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"saved_foods": {
                  Row: {
                    "athlete_id": string,"brand": string | null,"calories": number,"carbs_g": number,"coach_id": string,"created_at": string,"fat_g": number,"id": string,"ingredients": string | null,"is_favorite": boolean,"kind": string,"name": string,"protein_g": number,"serving_label": string,"source": string,"source_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "athlete_id": string,"brand"?: string | null,"calories": number,"carbs_g": number,"coach_id"?: string,"created_at"?: string,"fat_g": number,"id"?: string,"ingredients"?: string | null,"is_favorite"?: boolean,"kind": string,"name": string,"protein_g": number,"serving_label": string,"source": string,"source_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "athlete_id"?: string,"brand"?: string | null,"calories"?: number,"carbs_g"?: number,"coach_id"?: string,"created_at"?: string,"fat_g"?: number,"id"?: string,"ingredients"?: string | null,"is_favorite"?: boolean,"kind"?: string,"name"?: string,"protein_g"?: number,"serving_label"?: string,"source"?: string,"source_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_foods_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "saved_foods_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    }
                  ]
                },"stripe_webhook_events": {
                  Row: {
                    "id": string,"received_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id": string,"received_at"?: string
                  }
                  Update: {
                    "id"?: string,"received_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"workout_movements": {
                  Row: {
                    "calories": number | null,"coach_id": string,"distance_m": number | null,"duration_seconds": number | null,"id": string,"load_kg": number | null,"movement_id": string,"notes": string | null,"position": number,"reps": number | null,"sets": number | null,"workout_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "calories"?: number | null,"coach_id"?: string,"distance_m"?: number | null,"duration_seconds"?: number | null,"id"?: string,"load_kg"?: number | null,"movement_id": string,"notes"?: string | null,"position"?: number,"reps"?: number | null,"sets"?: number | null,"workout_id": string
                  }
                  Update: {
                    "calories"?: number | null,"coach_id"?: string,"distance_m"?: number | null,"duration_seconds"?: number | null,"id"?: string,"load_kg"?: number | null,"movement_id"?: string,"notes"?: string | null,"position"?: number,"reps"?: number | null,"sets"?: number | null,"workout_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workout_movements_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workout_movements_movement_id_fkey"
      columns: ["movement_id"]
isOneToOne: false
      referencedRelation: "movements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workout_movements_workout_id_coach_id_fkey"
      columns: ["workout_id","coach_id"]
isOneToOne: false
      referencedRelation: "workouts"
      referencedColumns: ["id","coach_id"]
    }
                  ]
                },"workout_results": {
                  Row: {
                    "athlete_id": string,"coach_id": string,"created_at": string,"energy": number | null,"id": string,"is_rx": boolean,"load_kg": number | null,"logged_by": string | null,"notes": string | null,"pain_notes": string | null,"performed_on": string,"reps": number | null,"rounds": number | null,"rpe": number | null,"sleep_hours": number | null,"soreness": number | null,"time_seconds": number | null,"updated_at": string | null,"workout_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "athlete_id": string,"coach_id"?: string,"created_at"?: string,"energy"?: number | null,"id"?: string,"is_rx"?: boolean,"load_kg"?: number | null,"logged_by"?: string | null,"notes"?: string | null,"pain_notes"?: string | null,"performed_on"?: string,"reps"?: number | null,"rounds"?: number | null,"rpe"?: number | null,"sleep_hours"?: number | null,"soreness"?: number | null,"time_seconds"?: number | null,"updated_at"?: string | null,"workout_id": string
                  }
                  Update: {
                    "athlete_id"?: string,"coach_id"?: string,"created_at"?: string,"energy"?: number | null,"id"?: string,"is_rx"?: boolean,"load_kg"?: number | null,"logged_by"?: string | null,"notes"?: string | null,"pain_notes"?: string | null,"performed_on"?: string,"reps"?: number | null,"rounds"?: number | null,"rpe"?: number | null,"sleep_hours"?: number | null,"soreness"?: number | null,"time_seconds"?: number | null,"updated_at"?: string | null,"workout_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workout_results_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "workout_results_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workout_results_workout_id_coach_id_fkey"
      columns: ["workout_id","coach_id"]
isOneToOne: false
      referencedRelation: "workouts"
      referencedColumns: ["id","coach_id"]
    }
                  ]
                },"workouts": {
                  Row: {
                    "athlete_id": string | null,"coach_id": string,"created_at": string,"day_number": number | null,"description": string | null,"id": string,"notes": string | null,"program_id": string | null,"rounds": number | null,"scheduled_on": string | null,"source_workout_id": string | null,"time_cap_seconds": number | null,"title": string,"updated_at": string,"week_number": number | null,"workout_type": Database["public"]['Enums']["workout_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "athlete_id"?: string | null,"coach_id"?: string,"created_at"?: string,"day_number"?: number | null,"description"?: string | null,"id"?: string,"notes"?: string | null,"program_id"?: string | null,"rounds"?: number | null,"scheduled_on"?: string | null,"source_workout_id"?: string | null,"time_cap_seconds"?: number | null,"title": string,"updated_at"?: string,"week_number"?: number | null,"workout_type": Database["public"]['Enums']["workout_type"]
                  }
                  Update: {
                    "athlete_id"?: string | null,"coach_id"?: string,"created_at"?: string,"day_number"?: number | null,"description"?: string | null,"id"?: string,"notes"?: string | null,"program_id"?: string | null,"rounds"?: number | null,"scheduled_on"?: string | null,"source_workout_id"?: string | null,"time_cap_seconds"?: number | null,"title"?: string,"updated_at"?: string,"week_number"?: number | null,"workout_type"?: Database["public"]['Enums']["workout_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "workouts_athlete_id_coach_id_fkey"
      columns: ["athlete_id","coach_id"]
isOneToOne: false
      referencedRelation: "athletes"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "workouts_coach_id_fkey"
      columns: ["coach_id"]
isOneToOne: false
      referencedRelation: "coaches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workouts_program_id_coach_id_fkey"
      columns: ["program_id","coach_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id","coach_id"]
    },{
      foreignKeyName: "workouts_source_workout_id_fkey"
      columns: ["source_workout_id"]
isOneToOne: false
      referencedRelation: "workouts"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "apply_athlete_account_change":
{ Args: { "p_card_index": number,"p_change": Json,"p_message_id": string,"p_today": string }; Returns: Json
                           },
            "apply_athlete_workout_adjustment":
{ Args: { "p_details": Json,"p_modifications": string,"p_proposal": Json,"p_suggestion_id": string }; Returns: string
                           },
"apply_draft_program":
{ Args: { "p_athlete_id": string,"p_program": Json,"p_today": string }; Returns: string
                           },
"athlete_assistant_settings":
{ Args: Record<PropertyKey, never>; Returns: {
              "assistant_nutrition": boolean,"assistant_recovery": boolean,"assistant_training": boolean,"athlete_ai_daily_limit": number,"athlete_rules": string,"coach_rules": string,"drift_days": number
            }[]
                           },
"athlete_can_view_workout":
{ Args: { "p_workout_id": string }; Returns: boolean
                           },
"athlete_weekly_reports":
{ Args: Record<PropertyKey, never>; Returns: {
              "content": Json,"id": string,"published_at": string,"snapshot": Json
            }[]
                           },
"claim_athlete_invite":
{ Args: { "p_token": string }; Returns: undefined
                           },
"clear_demo_data":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"complete_athlete_ai_card":
{ Args: { "p_action": string,"p_card_index": number,"p_message_id": string,"p_values": Json }; Returns: {
              "already_completed": boolean,"ref_id": string
            }[]
                           },
"copy_program_for_athlete":
{ Args: { "p_athlete_id": string,"p_program_id": string,"p_start_date"?: string }; Returns: string
                           },
"copy_workout_for_athlete":
{ Args: { "p_athlete_id": string,"p_scheduled_on": string,"p_workout_id": string }; Returns: string
                           },
"create_notification":
{ Args: { "p_athlete_id": string,"p_body"?: string,"p_dedupe_key"?: string,"p_kind": string,"p_link"?: string,"p_title": string }; Returns: undefined
                           },
"current_athlete_coach_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"current_athlete_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"current_gym_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"delete_athlete_workout":
{ Args: { "p_athlete_id": string,"p_workout_id": string }; Returns: undefined
                           },
"fail_athlete_workout_adjustment":
{ Args: { "p_error": string,"p_proposal"?: Json,"p_suggestion_id": string }; Returns: undefined
                           },
"get_coach_invite":
{ Args: { "p_token": string }; Returns: {
              "email": string,"gym_name": string,"usable": boolean
            }[]
                           },
"get_invite":
{ Args: { "p_token": string }; Returns: {
              "athlete_first_name": string,"coach_full_name": string,"email": string,"gym_name": string
            }[]
                           },
"is_check_in_time_zone":
{ Args: { "p_zone": string }; Returns: boolean
                           },
"is_gym_owner":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_pinned_form_comment":
{ Args: { "p_comment_id": string,"p_review_id": string }; Returns: boolean
                           },
"load_demo_data":
{ Args: { "reset"?: boolean }; Returns: Json
                           },
"load_demo_data_unscored":
{ Args: { "reset"?: boolean }; Returns: Json
                           },
"override_workout_for_athlete":
{ Args: { "p_athlete_id": string,"p_mode": string,"p_workout_id": string }; Returns: string
                           },
"programming_style_for_athlete":
{ Args: { "p_athlete_id": string }; Returns: Json
                           },
"publish_coach_waiver":
{ Args: { "p_body": string,"p_require_resign": boolean }; Returns: {
              "body": string,
"coach_id": string,
"created_at": string,
"created_by": string,
"id": string,
"requires_resign": boolean,
"version": number
            }
                          SetofOptions: {
        from: "*"
        to: "coach_waivers"
        isOneToOne: true
        isSetofReturn: false
      } },
"register_push_subscription":
{ Args: { "p_auth": string,"p_endpoint": string,"p_p256dh": string,"p_user_agent": string }; Returns: undefined
                           },
"remove_gym_coach":
{ Args: { "p_coach_id": string }; Returns: undefined
                           },
"restore_workout_for_athlete":
{ Args: { "p_athlete_id": string,"p_workout_id": string }; Returns: undefined
                           },
"save_ai_workout":
{ Args: { "p_athlete_id"?: string,"p_expected_updated_at"?: string,"p_movements": Json,"p_scheduled_on"?: string,"p_workout": Json,"p_workout_id": string }; Returns: string
                           },
"save_athlete_intake_step":
{ Args: { "p_athlete_id": string,"p_data": Json,"p_step": number,"p_today": string }; Returns: undefined
                           },
"sign_coach_waiver":
{ Args: { "p_signed_name": string,"p_user_agent": string,"p_waiver_id": string }; Returns: {
              "athlete_id": string,
"coach_id": string,
"id": string,
"signed_at": string,
"signed_name": string,
"user_agent": string | null,
"user_id": string,
"waiver_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "athlete_waiver_signatures"
        isOneToOne: true
        isSetofReturn: false
      } },
"start_athlete_workout_adjustment":
{ Args: { "p_input": Json,"p_model": string,"p_workout_id": string }; Returns: string
                           }
          }
          Enums: {
            "athlete_status": "active"|"archived","benchmark_kind": "girl"|"hero"|"lift"|"custom","experience_level": "beginner"|"intermediate"|"advanced"|"competitor","goal_status": "active"|"achieved"|"abandoned","goal_type": "performance"|"body_composition"|"skill","meal_type": "breakfast"|"lunch"|"dinner"|"snack","movement_category": "weightlifting"|"gymnastics"|"monostructural"|"other","movement_measure": "reps"|"load"|"distance"|"calories"|"time","suggestion_status": "pending"|"approved"|"edited"|"rejected"|"failed"|"idea","suggestion_type": "write_workout"|"scale_workout"|"adjust_macros"|"progress_summary"|"movement_guide"|"suggest_food"|"athlete_adjust_workout"|"draft_program"|"weekly_report"|"athlete_account_change","weight_unit": "lb"|"kg","workout_type": "for_time"|"amrap"|"emom"|"strength"|"other"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "athlete_status": ["active", "archived"],"benchmark_kind": ["girl", "hero", "lift", "custom"],"experience_level": ["beginner", "intermediate", "advanced", "competitor"],"goal_status": ["active", "achieved", "abandoned"],"goal_type": ["performance", "body_composition", "skill"],"meal_type": ["breakfast", "lunch", "dinner", "snack"],"movement_category": ["weightlifting", "gymnastics", "monostructural", "other"],"movement_measure": ["reps", "load", "distance", "calories", "time"],"suggestion_status": ["pending", "approved", "edited", "rejected", "failed", "idea"],"suggestion_type": ["write_workout", "scale_workout", "adjust_macros", "progress_summary", "movement_guide", "suggest_food", "athlete_adjust_workout", "draft_program", "weekly_report", "athlete_account_change"],"weight_unit": ["lb", "kg"],"workout_type": ["for_time", "amrap", "emom", "strength", "other"]
          }
        }
} as const
