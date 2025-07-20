class Validator {
  sanitizeText(text) {
    if (!text || typeof text !== 'string') return '';
    
    return text
      .replace(/[<>&"']/g, (match) => {
        const map = {
          '<': '&lt;',
          '>': '&gt;',
          '&': '&amp;',
          '"': '&quot;',
          "'": '&#39;'
        };
        return map[match];
      })
      .trim()
      .substring(0, 2000); // Telegram message limit
  }

  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  isValidPrice(price) {
    return typeof price === 'number' && price > 0 && price < 100000;
  }

  isValidTelegramId(id) {
    return typeof id === 'number' && id > 0;
  }

  isValidRooms(rooms) {
    return typeof rooms === 'number' && rooms >= 0 && rooms <= 10;
  }

  validateListing(listing) {
    const errors = [];
    
    if (!listing.title || typeof listing.title !== 'string' || listing.title.length < 5) {
      errors.push('Title must be at least 5 characters');
    }
    
    if (!listing.listing_url || !this.isValidUrl(listing.listing_url)) {
      errors.push('Valid listing URL is required');
    }
    
    if (listing.price !== null && listing.price !== undefined && !this.isValidPrice(listing.price)) {
      errors.push('Price must be a positive number less than 100,000');
    }
    
    if (listing.rooms !== null && listing.rooms !== undefined && !this.isValidRooms(listing.rooms)) {
      errors.push('Rooms must be between 0 and 10');
    }
    
    if (!listing.source || typeof listing.source !== 'string') {
      errors.push('Source is required');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  validateUserPreferences(preferences) {
    const errors = [];
    
    if (preferences.max_budget !== null && preferences.max_budget !== undefined) {
      if (typeof preferences.max_budget !== 'number' || preferences.max_budget <= 0) {
        errors.push('Budget must be a positive number');
      }
    }
    
    if (preferences.min_rooms !== null && preferences.min_rooms !== undefined) {
      if (!this.isValidRooms(preferences.min_rooms)) {
        errors.push('Rooms must be between 0 and 10');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  cleanPhoneNumber(phone) {
    if (!phone) return null;
    return phone.replace(/[^\d+]/g, '');
  }

  extractPrice(text) {
    if (!text) return null;
    
    // USD patterns
    const usdMatch = text.match(/\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/);
    if (usdMatch) {
      return parseInt(usdMatch[1].replace(/,/g, ''));
    }
    
    // IDR patterns and conversion
    const idrMatch = text.match(/(?:Rp|IDR)\s?(\d{1,3}(?:[.,]\d{3})*)/i);
    if (idrMatch) {
      const idrAmount = parseInt(idrMatch[1].replace(/[.,]/g, ''));
      return Math.round(idrAmount / 15000); // Convert to USD
    }
    
    return null;
  }
}

module.exports = new Validator();
