const validator = require('./validator');

class Formatter {
  formatListing(listing) {
    const {
      title,
      price,
      location,
      rooms,
      furnished,
      description,
      source,
      scraped_at
    } = listing;

    let message = `🏠 <b>${validator.sanitizeText(title)}</b>\n\n`;
    
    if (price) {
      message += `💰 <b>$${price.toLocaleString()}/month</b>\n`;
    } else {
      message += `💰 <b>Price on request</b>\n`;
    }
    
    if (location) {
      message += `📍 ${location}\n`;
    }
    
    if (rooms !== null && rooms !== undefined) {
      if (rooms === 0) {
        message += `🏠 Studio\n`;
      } else {
        message += `🛏️ ${rooms} bedroom${rooms > 1 ? 's' : ''}\n`;
      }
    }
    
    if (furnished !== null) {
      message += `🪑 ${furnished ? 'Furnished' : 'Unfurnished'}\n`;
    }
    
    message += `📱 <b>Source:</b> ${source}\n`;
    
    if (scraped_at) {
      const date = new Date(scraped_at);
      message += `🕒 <b>Listed:</b> ${date.toLocaleDateString()}\n`;
    }
    
    message += `\n`;
    
    if (description && description.length > 0) {
      const cleanDescription = validator.sanitizeText(description);
      const shortDesc = cleanDescription.length > 200 
        ? cleanDescription.substring(0, 200) + '...' 
        : cleanDescription;
      message += `${shortDesc}\n`;
    }
    
    return message;
  }

  formatDailyDigest(listings, userPreferences) {
    let message = `🌅 <b>Good morning! Your daily property digest</b>\n\n`;
    
    if (listings.length === 0) {
      message += `🔍 No new properties found matching your criteria today.\n`;
      message += `I'll keep searching for you!\n\n`;
      message += `<b>Your current preferences:</b>\n`;
      message += `📍 ${userPreferences.location || 'Any location'}\n`;
      message += `💰 Up to $${userPreferences.max_budget || 'No limit'}/month\n`;
      message += `🛏️ ${userPreferences.min_rooms || 'Any'} bedrooms minimum`;
      return message;
    }

    message += `Found <b>${listings.length}</b> new propert${listings.length > 1 ? 'ies' : 'y'} for you:\n\n`;
    
    listings.forEach((listing, index) => {
      message += `<b>${index + 1}. ${validator.sanitizeText(listing.title)}</b>\n`;
      message += `💰 ${listing.price ? '$' + listing.price.toLocaleString() : 'Price on request'}/month\n`;
      message += `📍 ${listing.location}\n`;
      if (listing.rooms !== null) {
        message += `🛏️ ${listing.rooms === 0 ? 'Studio' : listing.rooms + ' bedroom' + (listing.rooms > 1 ? 's' : '')}\n`;
      }
      message += `\n`;
    });
    
    message += `Use /listings to see full details and images!`;
    
    return message;
  }

  formatUserStats(stats) {
    return `
📊 <b>Your Activity Summary</b>

👀 <b>Views:</b> ${stats.viewed || 0}
❤️ <b>Saved:</b> ${stats.saved || 0}
❌ <b>Hidden:</b> ${stats.hidden || 0}
🔍 <b>Searches:</b> ${stats.searches || 0}

Keep exploring to find your perfect property! 🏡
    `;
  }

  formatErrorMessage(error) {
    const userFriendlyMessages = {
      'NETWORK_ERROR': 'Network error. Please check your connection.',
      'DATABASE_ERROR': 'Database error. Please try again later.',
      'SCRAPING_ERROR': 'Unable to fetch new listings. Please try again.',
      'VALIDATION_ERROR': 'Invalid input. Please check your data.',
      'RATE_LIMIT': 'Too many requests. Please wait a moment.'
    };

    return userFriendlyMessages[error.code] || 'Something went wrong. Please try again.';
  }
}

module.exports = new Formatter();
