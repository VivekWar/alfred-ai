class Formatter {
  formatListing(listing) {
    const {
      title,
      price,
      location,
      rooms,
      furnished,
      description,
      listing_url,
      source
    } = listing;

    let message = `🏠 <b>${title}</b>\n\n`;
    
    if (price) {
      message += `💰 <b>$${price}/month</b>\n`;
    }
    
    if (location) {
      message += `📍 ${location}\n`;
    }
    
    if (rooms) {
      message += `🛏️ ${rooms} room${rooms > 1 ? 's' : ''}\n`;
    }
    
    if (furnished !== null) {
      message += `🪑 ${furnished ? 'Furnished' : 'Unfurnished'}\n`;
    }
    
    message += `📱 Source: ${source}\n\n`;
    
    if (description) {
      const shortDesc = description.length > 100 
        ? description.substring(0, 100) + '...' 
        : description;
      message += `${shortDesc}\n\n`;
    }
    
    message += `🔗 <a href="${listing_url}">View Listing</a>`;
    
    return message;
  }

  formatDailyDigest(listings, userPreferences) {
    let message = `🌅 <b>Good morning! Here are today's top rentals:</b>\n\n`;
    
    if (listings.length === 0) {
      message += '🔍 No new listings found matching your preferences today.\nI\'ll keep searching for you!';
      return message;
    }

    message += `Found <b>${listings.length}</b> new listings:\n\n`;
    
    return message;
  }
}

module.exports = new Formatter();
