const database = require('../utils/database');
const logger = require('../utils/logger');
const { LOCATIONS, BUDGETS, ROOMS, DURATIONS } = require('../../config/constants');

class StartHandler {
  async start(ctx) {
    try {
      const user = ctx.from;
      logger.info(`User started bot: ${user.id} - ${user.first_name}`);

      // Create or get user
      let dbUser = await database.getUserByTelegramId(user.id);
      if (!dbUser) {
        dbUser = await database.createUser(user.id, user.username, user.first_name, user.last_name);
      }

      // Initialize session
      ctx.session = ctx.session || {};
      ctx.session.user = dbUser;
      ctx.session.onboarding = {};

      const welcomeMessage = `
🏡 <b>Welcome to Alfred AI V0!</b>

I'm your personal Bali property assistant. I'll help you find the perfect rental property based on your preferences.

Let's start by setting up your search criteria:

<b>Which area in Bali are you interested in?</b>
      `;

      const keyboard = {
        inline_keyboard: this.createLocationKeyboard()
      };

      await ctx.reply(welcomeMessage, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      });

      // Set onboarding state
      ctx.session.state = 'onboarding_location';

    } catch (error) {
      logger.error('Start handler error:', error);
      await ctx.reply('❌ Something went wrong. Please try again.');
    }
  }

  async handleCallback(ctx) {
    const data = ctx.callbackQuery.data;
    const session = ctx.session || {};

    try {
      await ctx.answerCbQuery();

      if (data.startsWith('location_')) {
        await this.handleLocationSelection(ctx, data.replace('location_', ''));
      } else if (data.startsWith('budget_')) {
        await this.handleBudgetSelection(ctx, data.replace('budget_', ''));
      } else if (data.startsWith('rooms_')) {
        await this.handleRoomsSelection(ctx, data.replace('rooms_', ''));
      } else if (data.startsWith('duration_')) {
        await this.handleDurationSelection(ctx, data.replace('duration_', ''));
      }
    } catch (error) {
      logger.error('Callback handler error:', error);
    }
  }

  async handleText(ctx) {
    // Handle any text input during onboarding
    const session = ctx.session || {};
    
    if (session.state === 'onboarding_location') {
      await this.handleLocationSelection(ctx, ctx.message.text);
    }
  }

  async handleLocationSelection(ctx, location) {
    ctx.session.onboarding.location = location;

    const message = `
📍 Great! You selected: <b>${location}</b>

💰 <b>What's your budget range per month?</b>
    `;

    const keyboard = {
      inline_keyboard: this.createBudgetKeyboard()
    };

    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });

    ctx.session.state = 'onboarding_budget';
  }

  async handleBudgetSelection(ctx, budgetIndex) {
    const budget = BUDGETS[parseInt(budgetIndex)];
    ctx.session.onboarding.max_budget = budget.value;

    const message = `
💰 Budget set: <b>${budget.text}</b>

🛏️ <b>How many bedrooms do you need?</b>
    `;

    const keyboard = {
      inline_keyboard: this.createRoomsKeyboard()
    };

    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });

    ctx.session.state = 'onboarding_rooms';
  }

  async handleRoomsSelection(ctx, roomsIndex) {
    const rooms = ROOMS[parseInt(roomsIndex)];
    ctx.session.onboarding.min_rooms = rooms.value;

    const message = `
🛏️ Bedrooms: <b>${rooms.text}</b>

📅 <b>How long are you planning to stay?</b>
    `;

    const keyboard = {
      inline_keyboard: this.createDurationKeyboard()
    };

    await ctx.editMessageText(message, {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });

    ctx.session.state = 'onboarding_duration';
  }

  async handleDurationSelection(ctx, durationIndex) {
    const duration = DURATIONS[parseInt(durationIndex)];
    ctx.session.onboarding.rental_duration = duration;

    // Save preferences
    await database.saveUserPreferences(ctx.session.user.id, ctx.session.onboarding);

    const message = `
✅ <b>Perfect! Your preferences are saved:</b>

📍 Location: ${ctx.session.onboarding.location}
💰 Budget: Up to $${ctx.session.onboarding.max_budget}/month
🛏️ Bedrooms: ${ROOMS.find(r => r.value === ctx.session.onboarding.min_rooms).text}
📅 Duration: ${duration}

I'll now search for properties that match your criteria. Use /listings to see available properties!

You can update your preferences anytime with /preferences.
    `;

    await ctx.editMessageText(message, {
      parse_mode: 'HTML'
    });

    ctx.session.state = 'complete';
  }

  createLocationKeyboard() {
    const keyboard = [];
    for (let i = 0; i < LOCATIONS.length; i += 2) {
      const row = [
        { text: LOCATIONS[i], callback_data: `location_${LOCATIONS[i]}` }
      ];
      if (LOCATIONS[i + 1]) {
        row.push({ text: LOCATIONS[i + 1], callback_data: `location_${LOCATIONS[i + 1]}` });
      }
      keyboard.push(row);
    }
    keyboard.push([{ text: '🌴 Any Location', callback_data: 'location_Any' }]);
    return keyboard;
  }

  createBudgetKeyboard() {
    return BUDGETS.map((budget, index) => [{
      text: budget.text,
      callback_data: `budget_${index}`
    }]);
  }

  createRoomsKeyboard() {
    return ROOMS.map((room, index) => [{
      text: room.text,
      callback_data: `rooms_${index}`
    }]);
  }

  createDurationKeyboard() {
    return DURATIONS.map((duration, index) => [{
      text: duration,
      callback_data: `duration_${index}`
    }]);
  }
}

module.exports = new StartHandler();
