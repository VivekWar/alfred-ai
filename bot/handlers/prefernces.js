const database = require('../utils/database');
const validator = require('../utils/validator');
const { Markup } = require('telegraf');
const logger = require('../utils/logger');

class PreferencesHandler {
  async handleLocation(ctx, userInput) {
    try {
      let location = userInput;
      
      if (userInput === '📍 Other Location') {
        await ctx.reply(
          'Please type your preferred location in Bali:',
          Markup.removeKeyboard()
        );
        ctx.session.step = 'custom_location';
        return;
      }

      // Clean location string (remove emojis)
      location = location.replace(/[🏄🍃🌿🏖️🏙️📍]/g, '').trim();
      
      ctx.session.preferences.location = location;
      ctx.session.step = 'budget';

      await ctx.reply(
        `Great! Looking for places in *${location}*\n\n` +
        `What's your maximum monthly budget?`,
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.keyboard([
            ['💸 $300-500', '💰 $500-800'],
            ['💎 $800-1200', '👑 $1200-2000'],
            ['🚀 $2000+', '🤷 No Limit']
          ]).resize().reply_markup
        }
      );

    } catch (error) {
      logger.error('Location handler error', error);
      await ctx.reply('❌ Error processing location. Please try again.');
    }
  }

  async handleBudget(ctx, userInput) {
    try {
      let maxBudget = null;

      if (userInput !== '🤷 No Limit') {
        const budgetMatch = userInput.match(/\$(\d+)(?:-(\d+))?/);
        if (budgetMatch) {
          maxBudget = parseInt(budgetMatch[2] || budgetMatch[1]);
        } else {
          // Try to extract number from custom input
          const customMatch = userInput.match(/(\d+)/);
          if (customMatch) {
            maxBudget = parseInt(customMatch[1]);
          }
        }
      }

      ctx.session.preferences.max_budget = maxBudget;
      ctx.session.step = 'rooms';

      await ctx.reply(
        maxBudget 
          ? `Budget set to *$${maxBudget}/month*\n\nHow many bedrooms minimum?`
          : `No budget limit set\n\nHow many bedrooms minimum?`,
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.keyboard([
            ['🛏️ Studio (0)', '🏠 1 Bedroom'],
            ['🏡 2 Bedrooms', '🏘️ 3 Bedrooms'],
            ['🏰 4+ Bedrooms', '🤷 Any']
          ]).resize().reply_markup
        }
      );

    } catch (error) {
      logger.error('Budget handler error', error);
      await ctx.reply('❌ Error processing budget. Please try again.');
    }
  }

  async handleRooms(ctx, userInput) {
    try {
      let minRooms = null;

      if (userInput !== '🤷 Any') {
        if (userInput.includes('Studio')) {
          minRooms = 0;
        } else {
          const roomMatch = userInput.match(/(\d+)/);
          if (roomMatch) {
            minRooms = parseInt(roomMatch[1]);
          }
        }
      }

      ctx.session.preferences.min_rooms = minRooms;
      ctx.session.step = 'duration';

      await ctx.reply(
        minRooms !== null 
          ? `Looking for ${minRooms === 0 ? 'studio' : minRooms + '+ bedroom'} places\n\nHow long do you plan to stay?`
          : `Any number of bedrooms\n\nHow long do you plan to stay?`,
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.keyboard([
            ['📅 1 Month', '📅 2-3 Months'],
            ['📅 3-6 Months', '📅 6-12 Months'],
            ['📅 1+ Year', '🤷 Flexible']
          ]).resize().reply_markup
        }
      );

    } catch (error) {
      logger.error('Rooms handler error', error);
      await ctx.reply('❌ Error processing room preference. Please try again.');
    }
  }

  async handleDuration(ctx, userInput) {
    try {
      let duration = userInput.replace(/📅|🤷/g, '').trim();
      
      ctx.session.preferences.rental_duration = duration;
      ctx.session.step = 'furnished';

      await ctx.reply(
        `Duration: *${duration}*\n\nDo you prefer furnished or unfurnished places?`,
        {
          parse_mode: 'Markdown',
          reply_markup: Markup.keyboard([
            ['🛋️ Furnished Only', '📦 Unfurnished Only'],
            ['🤷 No Preference']
          ]).resize().reply_markup
        }
      );

    } catch (error) {
      logger.error('Duration handler error', error);
      await ctx.reply('❌ Error processing duration. Please try again.');
    }
  }

  async handleFurnished(ctx, userInput) {
    try {
      let furnishedPref = null;
      
      if (userInput.includes('Furnished Only')) {
        furnishedPref = 'furnished';
      } else if (userInput.includes('Unfurnished Only')) {
        furnishedPref = 'unfurnished';
      }

      ctx.session.preferences.furnished_preference = furnishedPref;

      // Save preferences to database
      await database.saveUserPreferences(ctx.session.user.id, ctx.session.preferences);

      // Create summary
      const { preferences } = ctx.session;
      let summary = `✅ *Perfect! Your preferences are saved:*\n\n`;
      
      if (preferences.location) summary += `📍 Location: ${preferences.location}\n`;
      if (preferences.max_budget) summary += `💰 Budget: Up to $${preferences.max_budget}/month\n`;
      if (preferences.min_rooms !== null) summary += `🛏️ Rooms: ${preferences.min_rooms === 0 ? 'Studio' : preferences.min_rooms + '+'} minimum\n`;
      if (preferences.rental_duration) summary += `📅 Duration: ${preferences.rental_duration}\n`;
      if (preferences.furnished_preference) summary += `🛋️ Furnished: ${preferences.furnished_preference}\n`;

      summary += `\n🌅 I'll send you the *top 3 listings* every morning at 9 AM!\n\n`;
      summary += `Use /listings to get today's recommendations now!`;

      await ctx.reply(summary, {
        parse_mode: 'Markdown',
        reply_markup: Markup.keyboard([
          ['📋 View Listings', '⚙️ Edit Preferences'],
          ['ℹ️ Help', '📊 My Stats']
        ]).resize().reply_markup
      });

      // Clear session step
      delete ctx.session.step;

      logger.info(`Preferences saved for user ${ctx.session.user.id}`, preferences);

    } catch (error) {
      logger.error('Furnished handler error', error);
      await ctx.reply('❌ Error saving preferences. Please try again.');
    }
  }

  async handle(ctx, step, userInput) {
    switch (step) {
      case 'location':
        return this.handleLocation(ctx, userInput);
      case 'custom_location':
        ctx.session.preferences.location = userInput;
        ctx.session.step = 'budget';
        return this.handleLocation(ctx, userInput);
      case 'budget':
        return this.handleBudget(ctx, userInput);
      case 'rooms':
        return this.handleRooms(ctx, userInput);
      case 'duration':
        return this.handleDuration(ctx, userInput);
      case 'furnished':
        return this.handleFurnished(ctx, userInput);
      default:
        await ctx.reply('❌ Unknown step. Please start over with /start');
    }
  }
}

module.exports = new PreferencesHandler();
