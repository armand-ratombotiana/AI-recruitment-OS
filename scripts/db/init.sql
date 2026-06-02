-- =============================================================================
-- AI-ROS Database Initialization
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create custom types
DO $$ BEGIN
    CREATE TYPE candidate_status AS ENUM ('new', 'screening', 'interviewing', 'evaluation', 'offered', 'hired', 'rejected', 'withdrawn');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE job_status AS ENUM ('draft', 'open', 'on_hold', 'closed', 'filled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE interview_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled', 'no_show');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_candidates_email ON candidates USING btree (email);
CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates USING btree (status);
CREATE INDEX IF NOT EXISTS idx_candidates_created_at ON candidates USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs USING btree (status);
CREATE INDEX IF NOT EXISTS idx_jobs_department ON jobs USING btree (department);
CREATE INDEX IF NOT EXISTS idx_interviews_scheduled_at ON interviews USING btree (scheduled_at);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_candidates_search ON candidates USING gin (
    to_tsvector('english', coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(email, ''))
);

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE airos TO airos;
GRANT ALL PRIVILEGES ON SCHEMA public TO airos;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO airos;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO airos;
