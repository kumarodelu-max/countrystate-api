-- CountryState API SaaS Platform - Database Schema
-- Run this once to set up the database structure

-- Enable UUID support
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    full_name       VARCHAR(255),
    country_code    CHAR(2),               -- e.g. 'IN', 'US'
    currency        CHAR(3) DEFAULT 'USD', -- 'INR' or 'USD'
    plan            VARCHAR(20) DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
    is_active       BOOLEAN DEFAULT TRUE,
    role            VARCHAR(20) DEFAULT 'user',
    verification_token VARCHAR(255),
    is_verified     BOOLEAN DEFAULT FALSE,
    reset_token     VARCHAR(255),
    reset_expires   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- API KEYS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS api_keys (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_value       VARCHAR(64) UNIQUE NOT NULL, -- hashed/stored key
    name            VARCHAR(100) DEFAULT 'Default Key',
    is_active       BOOLEAN DEFAULT TRUE,
    daily_limit     INT DEFAULT 100,             -- requests per day
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    last_used_at    TIMESTAMPTZ
);

-- ============================================================
-- COUNTRIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS countries (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    iso2            CHAR(2) UNIQUE NOT NULL,     -- e.g. 'IN', 'US'
    iso3            CHAR(3) UNIQUE NOT NULL,     -- e.g. 'IND', 'USA'
    numeric_code    VARCHAR(5),
    phone_code      VARCHAR(20),
    capital         VARCHAR(100),
    currency_code   CHAR(3),
    currency_name   VARCHAR(100),
    currency_symbol VARCHAR(10),
    tld             VARCHAR(10),                 -- top-level domain e.g. '.in'
    region          VARCHAR(50),                 -- e.g. 'Asia'
    subregion       VARCHAR(100),
    latitude        DECIMAL(10, 8),
    longitude       DECIMAL(11, 8),
    emoji           VARCHAR(10),
    emoji_unicode   VARCHAR(20),
    is_active       BOOLEAN DEFAULT TRUE
);

-- ============================================================
-- STATES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS states (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    state_code      VARCHAR(20),
    country_id      INT NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
    country_code    CHAR(2) NOT NULL,
    latitude        DECIMAL(10, 8),
    longitude       DECIMAL(11, 8),
    is_active       BOOLEAN DEFAULT TRUE
);

-- ============================================================
-- CITIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS cities (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    state_id        INT NOT NULL REFERENCES states(id) ON DELETE CASCADE,
    state_code      VARCHAR(20),
    country_id      INT NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
    country_code    CHAR(2) NOT NULL,
    latitude        DECIMAL(10, 8),
    longitude       DECIMAL(11, 8),
    is_active       BOOLEAN DEFAULT TRUE
);

-- ============================================================
-- TRANSLATIONS TABLE (polymorphic)
-- ============================================================
CREATE TABLE IF NOT EXISTS translations (
    id              SERIAL PRIMARY KEY,
    entity_type     VARCHAR(20) NOT NULL CHECK (entity_type IN ('country', 'state', 'city')),
    entity_id       INT NOT NULL,
    locale          VARCHAR(10) NOT NULL, -- e.g. 'hi', 'es', 'fr'
    translated_name VARCHAR(200) NOT NULL,
    UNIQUE (entity_type, entity_id, locale)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_countries_iso2     ON countries(iso2);
CREATE INDEX IF NOT EXISTS idx_states_country_id  ON states(country_id);
CREATE INDEX IF NOT EXISTS idx_states_country_code ON states(country_code);
CREATE INDEX IF NOT EXISTS idx_cities_state_id    ON cities(state_id);
CREATE INDEX IF NOT EXISTS idx_cities_country_code ON cities(country_code);
CREATE INDEX IF NOT EXISTS idx_translations_entity ON translations(entity_type, entity_id, locale);
CREATE INDEX IF NOT EXISTS idx_api_keys_value     ON api_keys(key_value);
CREATE INDEX IF NOT EXISTS idx_api_keys_user      ON api_keys(user_id);

-- ============================================================
-- PLANS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS plans (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(50) UNIQUE NOT NULL,
    name            VARCHAR(100) NOT NULL,
    daily_limit     INT NOT NULL DEFAULT 100,
    monthly_limit   INT NOT NULL DEFAULT 0,
    price_monthly   DECIMAL(10, 2) DEFAULT 0.00,
    price_yearly    DECIMAL(10, 2) DEFAULT 0.00,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PLAN HISTORY TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS plan_history (
    id                  SERIAL PRIMARY KEY,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    old_plan            VARCHAR(50),
    new_plan            VARCHAR(50),
    old_limit           INT,
    new_limit           INT,
    source              VARCHAR(50) DEFAULT 'admin_manual',
    changed_by_admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USER PROMOS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS user_promos (
    id              SERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message         TEXT NOT NULL,
    type            VARCHAR(50) DEFAULT 'promo',
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- API LOGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS api_logs (
    id              BIGSERIAL PRIMARY KEY,
    api_key         VARCHAR(64) NOT NULL,
    endpoint        VARCHAR(255) NOT NULL,
    method          VARCHAR(10) NOT NULL,
    ip_address      VARCHAR(45),
    status_code     INT,
    response_time   INT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_logs_api_key ON api_logs(api_key);
CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON api_logs(created_at);
