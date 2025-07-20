const database = require('../bot/utils/database');
const formatter = require('../bot/utils/formatter');
const logger = require('../bot/utils/logger');
const bot = require('../bot/bot');
const constants = require('../config/constants');

class DailyDigestService {
  async sendToAllUsers() {
    try {
      logger.info('🌅 Starting daily digest process...');
      
      const users = await database.getAllActiveUsers();
      logger.info(`Found ${users.length} active users`);
      
      let successCount = 0;
      let errorCount = 0;

      for (const user of users) {
        try {
          await this.sendDigestToUser(user);
          successCount++;
          
          // Rate limiting - wait between messages
          await this.delay(constants.TELEGRAM.RATE_LIMIT_DELAY);
          
        } catch (error) {
          errorCount++;
          logger.error(`Failed to send digest to user ${user.telegram_id}:`, error);
        }
      }

      logger.info(`Daily digest completed: ${successCount} sent, ${errorCount} failed`);
      return { successCount, errorCount };
      
    } catch (error) {
      logger.error('Daily digest service error:', error);
      throw error;
    }
  }

  async sendDigestToUser(user) {
    try {
      // Get user preferences
      const preferences = await database.getUserPreferences(user.id);
      
      if (!preferences) {
        logger.warn(`No preferences found for user ${user.telegram_id}`);
        return;
      }

      // Get filtered listings
      const listings = await database.getFilteredListings(preferences);
      
      if (listings.length === 0) {
        await this.sendNoListingsMessage(user.telegram_id, preferences);
        return;
      }

      // Send digest header
      await bot.telegram.sendMessage(
        user.telegram_id,
        formatter.formatDailyDigestHeader(listings.length),
        { parse_mode: 'HTML' }
      );

      // Send top 3 listings
      const topListings = listings.slice(0, 3);
      
      for (let i = 0; i < topListings.length; i++) {
        const listing = topListings[i];
        const message = formatter.formatListing(listing, i + 1);
        
        await bot.telegram.sendMessage(
          user.telegram_id,
          message,
          { 
            parse_mode: 'HTML',
            disable_web_page_preview: false
          }
        );

        // Log interaction
        await database.logInteraction(user.id, listing.id, 'daily_digest_sent');
        
        // Small delay between listings
        await this.delay(500);
      }

      // Send footer with options
      if (listings.length > 3) {
        await bot.telegram.sendMessage(
          user.telegram_id,
          `📋 *${listings.length - 3} more listings available*\n\nUse /listings to see all results!`,
          { parse_mode: 'Markdown' }
        );
      }

      logger.info(`Digest sent to user ${user.telegram_id}: ${topListings.length} listings`);
      
    } catch (error) {
      // Handle blocked users or other telegram errors
      if (error.code === 403) {
        await database.deactivateUser(user.id);
        logger.info(`User ${user.telegram_id} blocked the bot - deactivated`);
      } else {
        throw error;
      }
    }
  }

  async sendNoListingsMessage(telegramId, preferences) {
    const message = `🌅 *Good morning!*\n\n` +
      `🔍 No new listings matching your preferences today, but don't worry!\n\n` +
      `I'm continuously searching for:\n` +
      `📍 Location: ${preferences.location || 'Any location'}\n` +
      (preferences.max_budget ? `💰 Budget: Up to $${preferences.max_budget}/month\n` : '') +
      (preferences.min_rooms !== null ? `🛏️ Rooms: ${preferences.min_rooms}+ minimum\n` : '') +
      `\n💡 *Tip*: You can adjust your preferences anytime with /start\n\n` +
      `I'll keep searching and update you tomorrow! 🏠`;

    await bot.telegram.sendMessage(telegramId, message, {
      parse_mode: 'Markdown'
    });
  }

  async sendWeeklyStats() {
    try {
      logger.info('📊 Sending weekly stats...');
      
      const users = await database.getAllActiveUsers();
      const stats = await database.getWeeklyStats();
      
      for (const user of users) {
        try {
          const userStats = await database.getUserStats(user.id);
          const message = formatter.formatWeeklyStats(stats, userStats);
          
          await bot.telegram.sendMessage(user.telegram_id, message, {
            parse_mode: 'Markdown'
          });
          
          await this.delay(constants.TELEGRAM.RATE_LIMIT_DELAY);
          
        } catch (error) {
          logger.error(`Failed to send weekly stats to user ${user.telegram_id}:`, error);
        }
      }
      
      logger.info('Weekly stats sending completed');
      
    } catch (error) {
      logger.error('Weekly stats service error:', error);
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new DailyDigestService();
