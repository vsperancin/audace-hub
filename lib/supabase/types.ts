/**
 * Database types — mirror do schema real (inclui tabelas profiles, connections,
 * sync_jobs, oauth_states).
 *
 * Em produção, rode `npx supabase gen types typescript --project-id <id>`
 * e cole a saída gerada aqui. Por enquanto, definimos manualmente as tabelas
 * usadas pela aplicação.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type PlatformType = 'mercadolivre' | 'shopee' | 'magalu' | 'amazon';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      connections: {
        Row: {
          id: string;
          user_id: string;
          platform: PlatformType;
          account_id: string;
          account_label: string | null;
          account_metadata: Json | null;
          access_token_encrypted: string;
          refresh_token_encrypted: string | null;
          token_expires_at: string | null;
          scopes: string[];
          status: 'active' | 'expired' | 'error' | 'disconnected';
          last_error: string | null;
          last_sync_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          platform: PlatformType;
          account_id: string;
          account_label?: string | null;
          account_metadata?: Json | null;
          access_token_encrypted: string;
          refresh_token_encrypted?: string | null;
          token_expires_at?: string | null;
          scopes?: string[];
          status?: 'active' | 'expired' | 'error' | 'disconnected';
          last_error?: string | null;
          last_sync_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          platform?: PlatformType;
          account_id?: string;
          account_label?: string | null;
          account_metadata?: Json | null;
          access_token_encrypted?: string;
          refresh_token_encrypted?: string | null;
          token_expires_at?: string | null;
          scopes?: string[];
          status?: 'active' | 'expired' | 'error' | 'disconnected';
          last_error?: string | null;
          last_sync_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sync_jobs: {
        Row: {
          id: string;
          connection_id: string;
          job_type: string;
          status: string;
          error_message: string | null;
          started_at: string | null;
          finished_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          connection_id: string;
          job_type: string;
          status: string;
          error_message?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          connection_id?: string;
          job_type?: string;
          status?: string;
          error_message?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      oauth_states: {
        Row: {
          id: string;
          state: string;
          user_id: string;
          platform: string;
          redirect_after: string | null;
          created_at: string;
          expires_at: string;
          consumed_at: string | null;
        };
        Insert: {
          id?: string;
          state: string;
          user_id: string;
          platform?: string;
          redirect_after?: string | null;
          created_at?: string;
          expires_at: string;
          consumed_at?: string | null;
        };
        Update: {
          id?: string;
          state?: string;
          user_id?: string;
          platform?: string;
          redirect_after?: string | null;
          created_at?: string;
          expires_at?: string;
          consumed_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}