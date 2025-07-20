const database = require('../utils/database');
const validator = require('../utils/validator');
const { Markup } = require('telegraf');
const logger = require('../utils/logger');

class StartHandler {
  async handle(ctx) {
    const telegramId = ctx.from.id;
    const username = ctx.from.username;
    const firstName = ctx.from.first_name;

    try {
      logger.info(`New user starting bot: ${telegramId} (@${username})`);

      let user = await database.getUserByTelegramId(telegramId);
      
      if (!user) {
        user = await database.createUser(telegramId, username, firstName);
        logger.info(`Created new user: ${user.id}`);
      }

      await ctx.reply(
        `🏠 *Welcome to Alfred\\.ai\\!*\n\n` +
        `I'm your personal Bali rental assistant\\. I'll help you find the perfect place by:\n\n` +
        `🔍 Scraping multiple rental websites daily\n` +
        `📱 Filtering based on your preferences\n` +
        `📧 Sending you top 3 listings every morning\n\n` +
        `Let's get started\\! Which area of Bali interests you most?`,
        {
          parse_mode: 'MarkdownV2',
          reply_markup: Markup.keyboard([
            ['🏄 Canggu', '🍃 Seminyak'],
            ['🌿 Ubud', '🏖️ Sanur'],
            ['🏙️ Denpasar', '📍 Other Location']
          ]).resize().reply_markup
        }
      );

      // Initialize user session
      if (!ctx.session) ctx.session = {};
      ctx.session.user = user;
      ctx.session.step = 'location';
      ctx.session.preferences = {};

    } catch (error) {
      logger.error('Start handler error', { telegramId, error: error.message });
      await ctx.reply('❌ Sorry, something went wrong. Please try again later.');
    }
  }
}

module.exports = new StartHandler();
