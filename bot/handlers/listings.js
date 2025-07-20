const database = require('../utils/database');
const formatter = require('../utils/formatter');
const logger = require('../utils/logger');

class ListingsHandler {
  async showListings(ctx) {
    try {
      const user = ctx.from;
      let dbUser = await database.getUserByTelegramId(user.id);
      
      if (!dbUser) {
        return ctx.reply('👋 Please start with /start to set up your preferences first!');
      }

      const preferences = await database.getUserPreferences(dbUser.id);
      
      if (!preferences) {
        return ctx.reply('🎯 Please set up your preferences first using /start');
      }

      await ctx.reply('🔍 Searching for properties that match your criteria...');

      const listings = await database.getFilteredListings(preferences);

      if (!listings || listings.length === 0) {
        return ctx.reply(`
😔 <b>No properties found matching your criteria</b>

Try adjusting your preferences with /preferences or check back later for new listings!

Current criteria:
📍 Location: ${preferences.location || 'Any'}
💰 Budget: Up to $${preferences.max_budget || 'No limit'}/month
🛏️ Min bedrooms: ${preferences.min_rooms || 'Any'}
        `, { parse_mode: 'HTML' });
      }

      // Log interaction
      await database.logInteraction(dbUser.id, null, 'searched_listings');

      // Send listings one by one
      for (const listing of listings.slice(0, 10)) {
        await this.sendListing(ctx, listing, dbUser.id);
        await this.delay(1000); // Avoid rate limiting
      }

      await ctx.reply(`
📊 <b>Search Complete!</b>

Found ${listings.length} properties matching your criteria.
${listings.length > 10 ? 'Showing first 10 results.' : ''}

💡 <b>Tip:</b> Use /preferences to adjust your search criteria.
      `, { parse_mode: 'HTML' });

    } catch (error) {
      logger.error('Listings handler error:', error);
      await ctx.reply('❌ Error fetching listings. Please try again.');
    }
  }

  async sendListing(ctx, listing, userId) {
    try {
      const message = formatter.formatListing(listing);
      
      const keyboard = {
        inline_keyboard: [
          [
            { text: '❤️ Save', callback_data: `listing_save_${listing.id}` },
            { text: '👁️ View Details', callback_data: `listing_view_${listing.id}` },
            { text: '❌ Hide', callback_data: `listing_hide_${listing.id}` }
          ],
          [
            { text: '🔗 Open Link', url: listing.listing_url }
          ]
        ]
      };

      // Send with image if available
      if (listing.image_urls && listing.image_urls.length > 0) {
        try {
          await ctx.replyWithPhoto(listing.image_urls[0], {
            caption: message,
            parse_mode: 'HTML',
            reply_markup: keyboard
          });
        } catch (imageError) {
          // Fallback to text message if image fails
          await ctx.reply(message, {
            parse_mode: 'HTML',
            reply_markup: keyboard
          });
        }
      } else {
        await ctx.reply(message, {
          parse_mode: 'HTML',
          reply_markup: keyboard
        });
      }

      // Log view interaction
      await database.logInteraction(userId, listing.id, 'viewed');

    } catch (error) {
      logger.error('Send listing error:', error);
    }
  }

  async handleListingCallback(ctx) {
    try {
      const data = ctx.callbackQuery.data;
      const [, action, listingId] = data.split('_');
      
      await ctx.answerCbQuery();

      const user = await database.getUserByTelegramId(ctx.from.id);
      if (!user) return;

      switch (action) {
        case 'save':
          await database.logInteraction(user.id, listingId, 'saved');
          await ctx.answerCbQuery('❤️ Saved to your favorites!');
          break;
        
        case 'view':
          await database.logInteraction(user.id, listingId, 'viewed_details');
          await ctx.answerCbQuery('👁️ Viewing details...');
          break;
        
        case 'hide':
          await database.logInteraction(user.id, listingId, 'hidden');
          await ctx.answerCbQuery('❌ Property hidden');
          // Could also edit the message to show it's hidden
          break;
      }
    } catch (error) {
      logger.error('Listing callback error:', error);
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new ListingsHandler();
