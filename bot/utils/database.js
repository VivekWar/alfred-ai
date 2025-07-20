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
  async getAllActiveUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('is_active', true);
  
  if (error) throw error;
  return data;
}

async getUserPreferences(userId) {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async deactivateUser(userId) {
  const { error } = await supabase
    .from('users')
    .update({ is_active: false, updated_at: new Date() })
    .eq('id', userId);
  
  if (error) throw error;
}

async logInteraction(userId, listingId, action) {
  const { error } = await supabase
    .from('user_interactions')
    .insert({
      user_id: userId,
      listing_id: listingId,
      action: action
    });
  
  if (error) throw error;
}

async getWeeklyStats() {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { data, error } = await supabase
    .from('listings')
    .select('source')
    .gte('scraped_at', weekAgo.toISOString());
  
  if (error) throw error;
  
  // Group by source
  const stats = data.reduce((acc, listing) => {
    acc[listing.source] = (acc[listing.source] || 0) + 1;
    return acc;
  }, {});

  return {
    total_listings: data.length,
    by_source: stats,
    week_start: weekAgo
  };
}

async getUserStats(userId) {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { data, error } = await supabase
    .from('user_interactions')
    .select('action')
    .eq('user_id', userId)
    .gte('created_at', weekAgo.toISOString());
  
  if (error) throw error;
  
  return {
    total_interactions: data.length,
    viewed: data.filter(i => i.action === 'viewed').length,
    saved: data.filter(i => i.action === 'saved').length,
    hidden: data.filter(i => i.action === 'hidden').length
  };
}

}

module.exports = new Database();
