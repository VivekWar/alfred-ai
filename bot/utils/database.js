const { createClient } = require('@supabase/supabase-js');
const logger = require('./logger');

class Database {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
  }

  async createUser(telegramId, username, firstName, lastName) {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .insert([{
          telegram_id: telegramId,
          username: username,
          first_name: firstName,
          last_name: lastName
        }])
        .select()
        .single();
      
      if (error) throw error;
      logger.info(`Created user: ${telegramId}`);
      return data;
    } catch (error) {
      logger.error('Create user error:', error);
      throw error;
    }
  }

  async getUserByTelegramId(telegramId) {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('telegram_id', telegramId)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (error) {
      logger.error('Get user error:', error);
      return null;
    }
  }

  async saveUserPreferences(userId, preferences) {
    try {
      const { data, error } = await this.supabase
        .from('user_preferences')
        .upsert({
          user_id: userId,
          ...preferences,
          updated_at: new Date()
        })
        .select()
        .single();
      
      if (error) throw error;
      logger.info(`Saved preferences for user: ${userId}`);
      return data;
    } catch (error) {
      logger.error('Save preferences error:', error);
      throw error;
    }
  }

  async getUserPreferences(userId) {
    try {
      const { data, error } = await this.supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (error) {
      logger.error('Get preferences error:', error);
      return null;
    }
  }

  async saveListings(listings) {
    try {
      const { data, error } = await this.supabase
        .from('listings')
        .upsert(listings, { 
          onConflict: 'listing_url',
          ignoreDuplicates: false 
        })
        .select();
      
      if (error) throw error;
      logger.info(`Saved ${listings.length} listings`);
      return data;
    } catch (error) {
      logger.error('Save listings error:', error);
      throw error;
    }
  }

  async getFilteredListings(preferences) {
    try {
      let query = this.supabase
        .from('listings')
        .select('*')
        .eq('is_active', true)
        .gte('scraped_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      // Apply filters based on preferences
      if (preferences.location && preferences.location !== 'Any') {
        query = query.ilike('location', `%${preferences.location}%`);
      }
      
      if (preferences.max_budget) {
        query = query.or(`price.is.null,price.lte.${preferences.max_budget}`);
      }
      
      if (preferences.min_rooms >= 0) {
        query = query.gte('rooms', preferences.min_rooms);
      }

      if (preferences.furnished_preference && preferences.furnished_preference !== 'Any') {
        const furnished = preferences.furnished_preference === 'Yes';
        query = query.eq('furnished', furnished);
      }

      const { data, error } = await query
        .order('scraped_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Get filtered listings error:', error);
      return [];
    }
  }

  async logInteraction(userId, listingId, action) {
    try {
      const { error } = await this.supabase
        .from('user_interactions')
        .insert({
          user_id: userId,
          listing_id: listingId,
          action: action
        });
      
      if (error) throw error;
    } catch (error) {
      logger.error('Log interaction error:', error);
    }
  }

  async getAllActiveUsers() {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*, user_preferences!inner(*)')
        .eq('is_active', true);
      
      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Get active users error:', error);
      return [];
    }
  }

  async getNewListingsForUser(preferences, lastSentAt) {
    try {
      const since = lastSentAt || new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      let query = this.supabase
        .from('listings')
        .select('*')
        .eq('is_active', true)
        .gte('scraped_at', since.toISOString());

      // Apply user filters
      if (preferences.location && preferences.location !== 'Any') {
        query = query.ilike('location', `%${preferences.location}%`);
      }
      
      if (preferences.max_budget) {
        query = query.or(`price.is.null,price.lte.${preferences.max_budget}`);
      }
      
      if (preferences.min_rooms >= 0) {
        query = query.gte('rooms', preferences.min_rooms);
      }

      const { data, error } = await query
        .order('scraped_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Get new listings error:', error);
      return [];
    }
  }
}

module.exports = new Database();
