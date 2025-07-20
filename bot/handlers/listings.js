const database = require('../utils/database');
const formatter = require('../utils/formatter');
const logger = require('../utils/logger');
const { Markup } = require('telegraf');

class ListingsHandler {
  async handle(ctx) {
    try {
      const user = await database.getUserByTelegramId(ctx.from.id);
      
      if (!user) {
        return ctx.reply(
          '👋 Welcome! Please start with /start to set your preferences first.',
          Markup.keyboard([['🚀 Get Started']]).resize().reply_markup
        );
      }

      // Get user preferences
      const preferences = await database.getUserPreferences(user.id);
      
      if (!preferences) {
        return ctx.reply(
          '⚙️ Please set your preferences first using /start',
          Markup.keyboard([['🚀 Get Started']]).resize().reply_markup
        );
      }

      await ctx.reply('🔍 Searching for listings that match your preferences...');

      // Get filtered listings
      const listings = await database.getFilteredListings(preferences);
      
      if (listings.length === 0) {
        const noListingsMsg = `🔍 *No listings found today*\n\n` +
          `Don't worry! I'm constantly scraping new properties. ` +
          `You'll get fresh listings in tomorrow's morning digest.\n\n` +
          `💡 *Tip*: Try adjusting your preferences with /start if you want to see more options.`;
        
        return ctx.reply(noListingsMsg, {
          parse_mode: 'Markdown',
          reply_markup: Markup.keyboard([
            ['⚙️ Edit Preferences', '📊 My Stats']
          ]).resize().reply_markup
        });
      }

      // Send header message
      await ctx.reply(
        `🏠 *Found ${listings.length} listing${listings.length > 1 ? 's' : ''} for you:*\n` +
        `Here are the top ${Math.min(3, listings.length)}:`,
        { parse_mode: 'Markdown' }
      );

      // Send top 3 listings
      const topListings = listings.slice(0, 3);
      
      for (let i = 0; i < topListings.length; i++) {
        const listing = topListings[i];
        const message = formatter.formatListing(listing, i + 1);
        
        // Add action buttons for each listing
        const buttons = Markup.inlineKeyboard([
          [
            Markup.button.url('🔗 View Details', listing.listing_url),
            Markup.button.callback('❤️ Save', `save_${listing.id}`)
          ],
          [Markup.button.callback('👎 Not Interested', `hide_${listing.id}`)]
        ]);

        await ctx.reply(message, {
          parse_mode: 'HTML',
          reply_markup: buttons.reply_markup,
          disable_web_page_preview: false
        });

        // Log user interaction
        await database.logInteraction(user.id, listing.id, 'viewed');
        
        // Small delay between messages
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Show more options if there are additional listings
      if (listings.length > 3) {
        await ctx.reply(
          `📋 *${listings.length - 3} more listings available*\n` +
          `Use the buttons below to see more or adjust your preferences.`,
          {
            parse_mode: 'Markdown',
            reply_markup: Markup.keyboard([
              ['📋 Show More', '⚙️ Edit Preferences'],
              ['📊 My Stats', 'ℹ️ Help']
            ]).resize().reply_markup
          }
        );
      }

      logger.info(`Sent ${topListings.length} listings to user ${user.id}`);

    } catch (error) {
      logger.error('Listings handler error', error);
      await ctx.reply('❌ Error fetching listings. Please try again later.');
    }
  }

  async handleSave(ctx) {
    try {
      const listingId = ctx.match[1];
      const user = await database.getUserByTelegramId(ctx.from.id);
      
      await database.logInteraction(user.id, listingId, 'saved');
      await ctx.answerCbQuery('❤️ Listing saved to your favorites!');
      
      logger.info(`User ${user.id} saved listing ${listingId}`);
    } catch (error) {
      logger.error('Save listing error', error);
      await ctx.answerCbQuery('❌ Error saving listing');
    }
  }

  async handleHide(ctx) {
    try {
      const listingId = ctx.match[1];
      const user = await database.getUserByTelegramId(ctx.from.id);
      
      await database.logInteraction(user.id, listingId, 'hidden');
      await ctx.answerCbQuery('👎 Listing hidden from your results');
      
      logger.info(`User ${user.id} hid listing ${listingId}`);
    } catch (error) {
      logger.error('Hide listing error', error);
      await ctx.answerCbQuery('❌ Error hiding listing');
    }
  }
}

module.exports = new ListingsHandler();
