const database = require('../utils/database');
const logger = require('../utils/logger');
const validator = require('../utils/validator');

// Constants for preferences
const LOCATIONS = [
  'Canggu', 'Seminyak', 'Ubud', 'Sanur', 'Denpasar',
  'Kuta', 'Legian', 'Jimbaran', 'Nusa Dua', 'Uluwatu', 'Berawa'
];

const BUDGETS = [
  { text: 'Under $500', value: 500 },
  { text: '$500 - $1000', value: 1000 },
  { text: '$1000 - $2000', value: 2000 },
  { text: '$2000 - $5000', value: 5000 },
  { text: 'Above $5000', value: 10000 },
  { text: 'No Limit', value: null }
];

const ROOMS = [
  { text: 'Studio', value: 0 },
  { text: '1 Bedroom', value: 1 },
  { text: '2 Bedrooms', value: 2 },
  { text: '3+ Bedrooms', value: 3 },
  { text: 'Any', value: null }
];

const DURATIONS = [
  'Short term (1-3 months)',
  'Medium term (3-6 months)', 
  'Long term (6+ months)',
  'Flexible'
];

const FURNISHED_OPTIONS = [
  { text: 'Furnished', value: 'Yes' },
  { text: 'Unfurnished', value: 'No' },
  { text: 'Any', value: 'Any' }
];

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
💰 <b>Max Budget:</b> ${preferences.max_budget ? '$' + preferences.max_budget : 'No limit'}/month
🛏️ <b>Min Bedrooms:</b> ${this.getRoomText(preferences.min_rooms)}
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
      
      await ctx.answerCbQuery();

      if (data.startsWith('pref_set_')) {
        await this.handlePreferenceSet(ctx, data);
        return;
      }

      const action = data.replace('pref_', '');

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
        case 'back':
          await this.showPreferences(ctx);
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
        // Create rows of 2 locations each
        ...this.createLocationRows(),
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
        ...BUDGETS.map((budget) => [{
          text: budget.text,
          callback_data: `pref_set_budget_${budget.value || 'unlimited'}`
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
          callback_data: `pref_set_rooms_${room.value !== null ? room.value : 'any'}`
        }]),
        [{ text: '« Back', callback_data: 'pref_back' }]
      ]
    };

    await ctx.editMessageText('🛏️ <b>Select minimum bedrooms:</b>', {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
  }

  async updateDuration(ctx) {
    const keyboard = {
      inline_keyboard: [
        ...DURATIONS.map((duration, index) => [{
          text: duration,
          callback_data: `pref_set_duration_${index}`
        }]),
        [{ text: '« Back', callback_data: 'pref_back' }]
      ]
    };

    await ctx.editMessageText('📅 <b>Select rental duration:</b>', {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
  }

  async updateFurnished(ctx) {
    const keyboard = {
      inline_keyboard: [
        ...FURNISHED_OPTIONS.map(option => [{
          text: option.text,
          callback_data: `pref_set_furnished_${option.value}`
        }]),
        [{ text: '« Back', callback_data: 'pref_back' }]
      ]
    };

    await ctx.editMessageText('🪑 <b>Select furnished preference:</b>', {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
  }

  async handlePreferenceSet(ctx, data) {
    try {
      const user = await database.getUserByTelegramId(ctx.from.id);
      if (!user) return;

      const currentPrefs = await database.getUserPreferences(user.id) || {};
      let updatedPrefs = { ...currentPrefs };
      let updateMessage = '';

      // Parse the callback data
      const parts = data.split('_');
      const type = parts[2]; // location, budget, rooms, duration, furnished
      const value = parts.slice(3).join('_');

      switch (type) {
        case 'location':
          updatedPrefs.location = value === 'Any' ? null : value;
          updateMessage = `📍 Location updated to: ${value}`;
          break;

        case 'budget':
          if (value === 'unlimited') {
            updatedPrefs.max_budget = null;
            updateMessage = '💰 Budget set to: No limit';
          } else {
            updatedPrefs.max_budget = parseInt(value);
            updateMessage = `💰 Budget updated to: $${value}/month`;
          }
          break;

        case 'rooms':
          if (value === 'any') {
            updatedPrefs.min_rooms = null;
            updateMessage = '🛏️ Bedrooms set to: Any';
          } else {
            updatedPrefs.min_rooms = parseInt(value);
            const roomText = value === '0' ? 'Studio' : `${value} bedroom${value > 1 ? 's' : ''}`;
            updateMessage = `🛏️ Minimum bedrooms updated to: ${roomText}`;
          }
          break;

        case 'duration':
          const durationIndex = parseInt(value);
          if (durationIndex >= 0 && durationIndex < DURATIONS.length) {
            updatedPrefs.rental_duration = DURATIONS[durationIndex];
            updateMessage = `📅 Duration updated to: ${DURATIONS[durationIndex]}`;
          }
          break;

        case 'furnished':
          updatedPrefs.furnished_preference = value;
          updateMessage = `🪑 Furnished preference updated to: ${value}`;
          break;

        default:
          throw new Error('Unknown preference type');
      }

      // Save updated preferences
      await database.saveUserPreferences(user.id, updatedPrefs);

      // Show success message with option to continue editing
      const keyboard = {
        inline_keyboard: [
          [
            { text: '✏️ Edit More', callback_data: 'pref_back' },
            { text: '✅ Done', callback_data: 'pref_done' }
          ]
        ]
      };

      await ctx.editMessageText(`${updateMessage}\n\nWhat would you like to do next?`, {
        reply_markup: keyboard
      });

    } catch (error) {
      logger.error('Handle preference set error:', error);
      await ctx.editMessageText('❌ Error updating preference. Please try again.');
    }
  }

  // Helper methods
  createLocationRows() {
    const rows = [];
    for (let i = 0; i < LOCATIONS.length; i += 2) {
      const row = [
        { text: LOCATIONS[i], callback_data: `pref_set_location_${LOCATIONS[i]}` }
      ];
      if (LOCATIONS[i + 1]) {
        row.push({ text: LOCATIONS[i + 1], callback_data: `pref_set_location_${LOCATIONS[i + 1]}` });
      }
      rows.push(row);
    }
    return rows;
  }

  getRoomText(rooms) {
    if (rooms === null || rooms === undefined) return 'Any';
    if (rooms === 0) return 'Studio';
    return `${rooms} bedroom${rooms > 1 ? 's' : ''}`;
  }

  getBudgetText(budget) {
    if (!budget) return 'No limit';
    const budgetOption = BUDGETS.find(b => b.value === budget);
    return budgetOption ? budgetOption.text : `$${budget}`;
  }

  // Method to reset all preferences
  async resetPreferences(ctx) {
    try {
      const user = await database.getUserByTelegramId(ctx.from.id);
      if (!user) return;

      const defaultPrefs = {
        location: null,
        max_budget: null,
        min_rooms: null,
        rental_duration: null,
        furnished_preference: 'Any'
      };

      await database.saveUserPreferences(user.id, defaultPrefs);
      
      await ctx.reply('🔄 All preferences have been reset to default values. Use /preferences to set them up again.');
      
    } catch (error) {
      logger.error('Reset preferences error:', error);
      await ctx.reply('❌ Error resetting preferences.');
    }
  }

  // Method to show preference summary
  async showPreferenceSummary(ctx) {
    try {
      const user = await database.getUserByTelegramId(ctx.from.id);
      if (!user) return;

      const preferences = await database.getUserPreferences(user.id);
      if (!preferences) {
        return ctx.reply('🎯 No preferences set. Use /start to set them up!');
      }

      const summary = `
📋 <b>Preference Summary:</b>

📍 <b>Location:</b> ${preferences.location || 'Any location in Bali'}
💰 <b>Budget:</b> ${preferences.max_budget ? 'Up to $' + preferences.max_budget.toLocaleString() + '/month' : 'No budget limit'}
🛏️ <b>Bedrooms:</b> ${this.getRoomText(preferences.min_rooms)} minimum
📅 <b>Duration:</b> ${preferences.rental_duration || 'Flexible duration'}
🪑 <b>Furnished:</b> ${preferences.furnished_preference || 'Any'}

💡 <b>Tip:</b> Use /listings to see properties matching these criteria!
      `;

      await ctx.reply(summary, { parse_mode: 'HTML' });

    } catch (error) {
      logger.error('Show preference summary error:', error);
      await ctx.reply('❌ Error showing preferences.');
    }
  }

  // Method to validate preferences before saving
  validatePreferences(preferences) {
    const validation = validator.validateUserPreferences(preferences);
    
    if (!validation.isValid) {
      logger.warn('Invalid preferences:', validation.errors);
      return false;
    }
    
    return true;
  }

  // Method to get preference statistics
  async getPreferenceStats(userId) {
    try {
      const preferences = await database.getUserPreferences(userId);
      if (!preferences) return null;

      return {
        hasLocation: !!preferences.location,
        hasBudget: !!preferences.max_budget,
        hasRoomRequirement: preferences.min_rooms !== null,
        hasDuration: !!preferences.rental_duration,
        hasFurnishedPreference: preferences.furnished_preference !== 'Any',
        completeness: this.calculateCompleteness(preferences)
      };
    } catch (error) {
      logger.error('Get preference stats error:', error);
      return null;
    }
  }

  calculateCompleteness(preferences) {
    let completed = 0;
    let total = 5;

    if (preferences.location) completed++;
    if (preferences.max_budget) completed++;
    if (preferences.min_rooms !== null) completed++;
    if (preferences.rental_duration) completed++;
    if (preferences.furnished_preference && preferences.furnished_preference !== 'Any') completed++;

    return Math.round((completed / total) * 100);
  }
}

module.exports = new PreferencesHandler();
