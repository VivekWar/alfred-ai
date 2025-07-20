const { Telegraf, session } = require('telegraf');
const logger = require('./utils/logger');

// Import handlers
const startHandler = require('./handlers/start');
const listingsHandler = require('./handlers/listings');
const preferencesHandler = require('./handlers/preferences');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Enable sessions
bot.use(session());

// Error handling middleware
bot.use(async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    logger.error('Bot error:', error);
    await ctx.reply('❌ Something went wrong. Please try again or contact support.');
  }
});

// Command handlers
bot.start(startHandler.start);
bot.command('listings', listingsHandler.showListings);
bot.command('preferences', preferencesHandler.showPreferences);
bot.command('help', (ctx) => {
  ctx.reply(`
🏡 <b>Alfred AI V0 - Your Bali Property Assistant</b>

<b>Commands:</b>
/start - Set up your preferences
/listings - View latest listings
/preferences - Update your preferences
/help - Show this help message

<b>Features:</b>
• Personalized property recommendations
• Real-time listings from multiple sources
• Daily digest of new properties
• Save and track your favorite listings

Happy house hunting! 🌴
  `, { parse_mode: 'HTML' });
});

// Handle text messages (for onboarding flow)
bot.on('text', startHandler.handleText);

// Handle callback queries (inline buttons)
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  
  if (data.startsWith('listing_')) {
    await listingsHandler.handleListingCallback(ctx);
  } else if (data.startsWith('pref_')) {
    await preferencesHandler.handlePreferenceCallback(ctx);
  } else {
    await startHandler.handleCallback(ctx);
  }
});

module.exports = bot;
