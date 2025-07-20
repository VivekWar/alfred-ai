const { Telegraf } = require('telegraf');
const database = require('../bot/utils/database');
const formatter = require('../bot/utils/formatter');
const logger = require('../bot/utils/logger');

class DailyDigestService {
  constructor() {
    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
  }

  async sendDailyDigests() {
    try {
      logger.info('🌅 Starting daily digest service...');
      
      const activeUsers = await database.getAllActiveUsers();
      logger.info(`Found ${activeUsers.length} active users`);

      let digestsSent = 0;
      const errors = [];

      for (const user of activeUsers) {
        try {
          await this.sendDigestToUser(user);
          digestsSent++;
          
          // Rate limiting
          await this.delay(1000);
          
        } catch (error) {
          logger.error(`Failed to send digest to user ${user.telegram_id}:`, error);
          errors.push({ userId: user.telegram_id, error: error.message });
        }
      }

      logger.info(`✅ Daily digest complete: ${digestsSent} sent, ${errors.length} errors`);
      
      return {
        success: true,
        sent: digestsSent,
        errors: errors.length,
        details: errors
      };

    } catch (error) {
      logger.error('Daily digest service failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async sendDigestToUser(user) {
    const preferences = user.user_preferences;
    if (!preferences) {
      logger.warn(`User ${user.telegram_id} has no preferences, skipping digest`);
      return;
    }

    // Get new listings since last digest (24 hours ago)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const newListings = await database.getNewListingsForUser(preferences, yesterday);

    if (newListings.length === 0) {
      logger.info(`No new listings for user ${user.telegram_id}`);
      // Optionally send "no new listings" message on certain days
      return;
    }

    const digestMessage = formatter.formatDailyDigest(newListings, preferences);

    try {
      await this.bot.telegram.sendMessage(user.telegram_id, digestMessage, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔍 View All Listings', callback_data: 'digest_view_all' },
              { text: '⚙️ Update Preferences', callback_data: 'digest_preferences' }
            ]
          ]
        }
      });

      // Log the digest send
      await database.logInteraction(user.id, null, 'digest_sent');
      
      logger.info(`✅ Digest sent to user ${user.telegram_id} with ${newListings.length} listings`);

    } catch (telegramError) {
      if (telegramError.code === 403) {
        // User blocked the bot, deactivate them
        logger.warn(`User ${user.telegram_id} blocked the bot, deactivating`);
        await this.deactivateUser(user.id);
      } else {
        throw telegramError;
      }
    }
  }

  async deactivateUser(userId) {
    try {
      await database.deactivateUser(userId);
      logger.info(`Deactivated user ${userId}`);
    } catch (error) {
      logger.error(`Failed to deactivate user ${userId}:`, error);
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async sendWeeklyStats() {
    try {
      logger.info('📊 Generating weekly stats...');
      
      const stats = await database.getWeeklyStats();
      const activeUsers = await database.getAllActiveUsers();

      const statsMessage = `
📊 <b>Weekly Alfred AI Stats</b>

👥 <b>Active Users:</b> ${activeUsers.length}
🏠 <b>New Listings:</b> ${stats.total_listings}

<b>By Source:</b>
${Object.entries(stats.by_source)
  .map(([source, count]) => `• ${source}: ${count}`)
  .join('\n')}

<b>Week of:</b> ${stats.week_start.toLocaleDateString()}
      `;

      // Send to admin users (you can define admin telegram IDs)
      const adminIds = process.env.ADMIN_TELEGRAM_IDS?.split(',') || [];
      
      for (const adminId of adminIds) {
        try {
          await this.bot.telegram.sendMessage(parseInt(adminId), statsMessage, {
            parse_mode: 'HTML'
          });
        } catch (error) {
          logger.error(`Failed to send stats to admin ${adminId}:`, error);
        }
      }

      logger.info('✅ Weekly stats sent to admins');

    } catch (error) {
      logger.error('Weekly stats failed:', error);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const service = new DailyDigestService();
  
  const action = process.argv[2] || 'digest';
  
  if (action === 'digest') {
    service.sendDailyDigests()
      .then(result => {
        console.log('Daily digest result:', result);
        process.exit(result.success ? 0 : 1);
      })
      .catch(error => {
        console.error('Daily digest error:', error);
        process.exit(1);
      });
  } else if (action === 'stats') {
    service.sendWeeklyStats()
      .then(() => {
        console.log('Weekly stats sent');
        process.exit(0);
      })
      .catch(error => {
        console.error('Weekly stats error:', error);
        process.exit(1);
      });
  }
}

module.exports = new DailyDigestService();
