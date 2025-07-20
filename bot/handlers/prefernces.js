const database = require('../utils/database');
const logger = require('../utils/logger');
const { LOCATIONS, BUDGETS, ROOMS, DURATIONS } = require('../../config/constants');

class PreferencesHandler {
  async showPreferences(ctx) {
    try {
      const user = await database.getUserByTelegramId(ctx.from.id);
      if (!user) {
        return ctx.reply('👋 Please start with /start first!');
      }

      const preferences = await database.getUserPreferences(user.id);
      if (!preferences) {
        return ctx.reply('🎯 No preferences set. Use /start to set them up!');
      }

      const message = `
🎯 <b>Your Current Preferences:</b>

📍 <b>Location:</b> ${preferences.location || 'Any'}
💰 <b>Max Budget:</b> $${preferences.max_budget || 'No limit'}/month
🛏️ <b>Min Bedrooms:</b> ${preferences.min_rooms || 'Any'}
📅 <b>Duration:</b> ${preferences.rental_duration || 'Not specified'}
🪑 <b>Furnished:</b> ${preferences.furnished_preference || 'Any'}

<b>What would you like to update?</b>
      `;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '📍 Location', callback_data: 'pref_location' },
            { text: '💰 Budget', callback_data: 'pref_budget' }
          ],
          [
            { text: '🛏️ Bedrooms', callback_data: 'pref_rooms' },
            { text: '📅 Duration', callback_data: 'pref_duration' }
          ],
          [
            { text: '🪑 Furnished', callback_data: 'pref_furnished' }
          ],
          [
            { text: '✅ Done', callback_data: 'pref_done' }
          ]
        ]
      };

      await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });

    } catch (error) {
      logger.error('Show preferences error:', error);
      await ctx.reply('❌ Error loading preferences.');
    }
  }

  async handlePreferenceCallback(ctx) {
    try {
      const data = ctx.callbackQuery.data;
      const action = data.replace('pref_', '');

      await ctx.answerCbQuery();

      switch (action) {
        case 'location':
          await this.updateLocation(ctx);
          break;
        case 'budget':
          await this.updateBudget(ctx);
          break;
        case 'rooms':
          await this.updateRooms(ctx);
          break;
        case 'duration':
          await this.updateDuration(ctx);
          break;
        case 'furnished':
          await this.updateFurnished(ctx);
          break;
        case 'done':
          await ctx.editMessageText('✅ Preferences updated! Use /listings to see new results.');
          break;
      }
    } catch (error) {
      logger.error('Preference callback error:', error);
    }
  }

  async updateLocation(ctx) {
    const keyboard = {
      inline_keyboard: [
        ...LOCATIONS.slice(0, 8).reduce((acc, location, index) => {
          if (index % 2 === 0) {
            acc.push([{ text: location, callback_data: `pref_set_location_${location}` }]);
          } else {
            acc[acc.length - 1].push({ text: location, callback_data: `pref_set_location_${location}` });
          }
          return acc;
        }, []),
        [{ text: '🌴 Any Location', callback_data: 'pref_set_location_Any' }],
        [{ text: '« Back', callback_data: 'pref_back' }]
      ]
    };

    await ctx.editMessageText('📍 <b>Select your preferred location:</b>', {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
  }

  async updateBudget(ctx) {
    const keyboard = {
      inline_keyboard: [
        ...BUDGETS.map((budget, index) => [{
          text: budget.text,
          callback_data: `pref_set_budget_${budget.value}`
        }]),
        [{ text: '« Back', callback_data: 'pref_back' }]
      ]
    };

    await ctx.editMessageText('💰 <b>Select your budget range:</b>', {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
  }

  async updateRooms(ctx) {
    const keyboard = {
      inline_keyboard: [
        ...ROOMS.map(room => [{
          text: room.text,
          callback_data: `pref_set_rooms_${room.value}`
        }]),
        [{ text: '« Back', callback_data: 'pref_back' }]
      ]
    };

    await ctx.editMessageText('🛏️ <b>Select minimum bedrooms:</b>', {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
  }

  // Add other update methods...
}

module.exports = new PreferencesHandler();
