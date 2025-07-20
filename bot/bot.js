const { Telegraf, Markup } = require('telegraf');
const database = require('./utils/database');
const formatter = require('./utils/formatter');
require('dotenv').config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Start command handler
bot.start(async (ctx) => {
  const telegramId = ctx.from.id;
  const username = ctx.from.username;
  const firstName = ctx.from.first_name;

  try {
    let user = await database.getUserByTelegramId(telegramId);
    
    if (!user) {
      user = await database.createUser(telegramId, username, firstName);
    }

    await ctx.reply(
      `🏠 Welcome to Alfred.ai! I'll help you find the perfect rental in Bali.\n\n` +
      `Let's set up your preferences. First, which area are you looking for?`,
      Markup.keyboard([
        ['Canggu', 'Seminyak'],
        ['Ubud', 'Sanur'],
        ['Denpasar', 'Other']
      ]).resize()
    );

    ctx.session = { user, step: 'location' };
  } catch (error) {
    console.error('Start command error:', error);
    await ctx.reply('❌ Sorry, something went wrong. Please try again later.');
  }
});

// Handle user responses
bot.on('text', async (ctx) => {
  if (!ctx.session || !ctx.session.user) {
    return ctx.reply('Please start with /start command');
  }

  const { step } = ctx.session;
  const userInput = ctx.message.text;

  try {
    switch (step) {
      case 'location':
        ctx.session.preferences = { location: userInput };
        ctx.session.step = 'budget';
        await ctx.reply(
          'What\'s your maximum monthly budget? (in USD)',
          Markup.keyboard([
            ['$500', '$800'],
            ['$1200', '$1500'],
            ['$2000+', 'Skip']
          ]).resize()
        );
        break;

      case 'budget':
        const budget = userInput === 'Skip' ? null : parseInt(userInput.replace(/[$,]/g, ''));
        ctx.session.preferences.max_budget = budget;
        ctx.session.step = 'rooms';
        await ctx.reply(
          'How many rooms minimum?',
          Markup.keyboard([
            ['1', '2'],
            ['3', '4+'],
            ['Skip']
          ]).resize()
        );
        break;

      case 'rooms':
        const rooms = userInput === 'Skip' ? null : parseInt(userInput.replace('+', ''));
        ctx.session.preferences.min_rooms = rooms;
        ctx.session.step = 'duration';
        await ctx.reply(
          'How long are you planning to stay?',
          Markup.keyboard([
            ['1 month', '3 months'],
            ['6 months', '1 year'],
            ['Long term', 'Skip']
          ]).resize()
        );
        break;

      case 'duration':
        ctx.session.preferences.rental_duration = userInput === 'Skip' ? null : userInput;
        
        // Save preferences
        await database.saveUserPreferences(ctx.session.user.id, ctx.session.preferences);
        
        await ctx.reply(
          '✅ Perfect! Your preferences have been saved.\n\n' +
          'I\'ll send you the top 3 listings every morning at 9 AM.\n\n' +
          'Use /listings to get today\'s recommendations now!',
          Markup.removeKeyboard()
        );
        
        delete ctx.session.step;
        break;
    }
  } catch (error) {
    console.error('Text handler error:', error);
    await ctx.reply('❌ Something went wrong. Please try again.');
  }
});

// Listings command
bot.command('listings', async (ctx) => {
  try {
    const user = await database.getUserByTelegramId(ctx.from.id);
    if (!user) {
      return ctx.reply('Please start with /start to set your preferences first.');
    }

    const { data: preferences } = await database.supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!preferences) {
      return ctx.reply('Please set your preferences first using /start');
    }

    const listings = await database.getFilteredListings(preferences);
    
    if (listings.length === 0) {
      return ctx.reply('🔍 No new listings found matching your preferences. I\'ll keep looking!');
    }

    await ctx.reply(`🏠 Found ${listings.length} listings for you:`);

    for (let i = 0; i < Math.min(3, listings.length); i++) {
      const listing = listings[i];
      const message = formatter.formatListing(listing);
      await ctx.reply(message, { parse_mode: 'HTML' });
    }
  } catch (error) {
    console.error('Listings command error:', error);
    await ctx.reply('❌ Error fetching listings. Please try again later.');
  }
});

module.exports = bot;
