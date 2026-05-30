-- =============================================================================
-- AI-ROS Database Initialization
-- =============================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Create application schema
CREATE SCHEMA IF NOT EXISTS airos;

-- Set default search path
ALTER DATABASE airos SET search_path TO airos, public;
