-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    state VARCHAR(50) DEFAULT 'new'
);

-- User preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    location VARCHAR(255),
    max_budget INTEGER,
    min_rooms INTEGER,
    rental_duration VARCHAR(100),
    furnished_preference VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Listings table
CREATE TABLE IF NOT EXISTS listings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    price INTEGER,
    location VARCHAR(255),
    rooms INTEGER DEFAULT 1,
    furnished BOOLEAN,
    description TEXT,
    image_urls TEXT[],
    listing_url TEXT UNIQUE NOT NULL,
    source VARCHAR(100) NOT NULL,
    scraped_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- User interactions table
CREATE TABLE IF NOT EXISTS user_interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- 'viewed', 'saved', 'hidden', 'contacted'
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_listings_active ON listings(is_active);
CREATE INDEX IF NOT EXISTS idx_listings_scraped_at ON listings(scraped_at);
CREATE INDEX IF NOT EXISTS idx_listings_location ON listings(location);
CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_interactions_user_id ON user_interactions(user_id);
