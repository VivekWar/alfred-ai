const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

class Database {
  async createUser(telegramId, username, firstName) {
    const { data, error } = await supabase
      .from('users')
      .insert([{
        telegram_id: telegramId,
        username: username,
        first_name: firstName
      }])
      .select();
    
    if (error) throw error;
    return data[0];
  }

  async getUserByTelegramId(telegramId) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async saveUserPreferences(userId, preferences) {
    const { data, error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: userId,
        ...preferences,
        updated_at: new Date()
      });
    
    if (error) throw error;
    return data;
  }

  async saveListings(listings) {
    const { data, error } = await supabase
      .from('listings')
      .upsert(listings, { 
        onConflict: 'listing_url',
        ignoreDuplicates: false 
      });
    
    if (error) throw error;
    return data;
  }

  async getFilteredListings(preferences) {
    let query = supabase
      .from('listings')
      .select('*')
      .eq('is_active', true)
      .gte('scraped_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (preferences.location) {
      query = query.ilike('location', `%${preferences.location}%`);
    }
    if (preferences.max_budget) {
      query = query.lte('price', preferences.max_budget);
    }
    if (preferences.min_rooms) {
      query = query.gte('rooms', preferences.min_rooms);
    }

    const { data, error } = await query
      .order('scraped_at', { ascending: false })
      .limit(10);

    if (error) throw error;
    return data;
  }
}

module.exports = new Database();
