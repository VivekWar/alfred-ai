class Validator {
  validateTelegramId(id) {
    return typeof id === 'number' && id > 0;
  }

  validateLocation(location) {
    if (!location || typeof location !== 'string') return false;
    return location.trim().length > 0 && location.trim().length <= 100;
  }

  validateBudget(budget) {
    if (budget === null || budget === undefined) return true; // No budget is valid
    return typeof budget === 'number' && budget > 0 && budget <= 50000;
  }

  validateRooms(rooms) {
    if (rooms === null || rooms === undefined) return true; // Any rooms is valid
    return typeof rooms === 'number' && rooms >= 0 && rooms <= 10;
  }

  validateDuration(duration) {
    if (!duration) return true; // No duration is valid
    const validDurations = [
      '1 Month', '2-3 Months', '3-6 Months', 
      '6-12 Months', '1+ Year', 'Flexible'
    ];
    return validDurations.includes(duration) || duration.length <= 50;
  }

  validateFurnishedPreference(preference) {
    if (!preference) return true;
    return ['furnished', 'unfurnished'].includes(preference);
  }

  validatePreferences(preferences) {
    const errors = [];

    if (preferences.location && !this.validateLocation(preferences.location)) {
      errors.push('Invalid location');
    }

    if (!this.validateBudget(preferences.max_budget)) {
      errors.push('Invalid budget amount');
    }

    if (!this.validateRooms(preferences.min_rooms)) {
      errors.push('Invalid room count');
    }

    if (!this.validateDuration(preferences.rental_duration)) {
      errors.push('Invalid rental duration');
    }

    if (!this.validateFurnishedPreference(preferences.furnished_preference)) {
      errors.push('Invalid furnished preference');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  validateListingData(listing) {
    const errors = [];

    if (!listing.title || listing.title.length < 5) {
      errors.push('Title too short');
    }

    if (listing.price && (listing.price < 0 || listing.price > 100000)) {
      errors.push('Invalid price range');
    }

    if (!listing.listing_url || !this.isValidUrl(listing.listing_url)) {
      errors.push('Invalid listing URL');
    }

    if (!listing.source || listing.source.length === 0) {
      errors.push('Source is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  sanitizeText(text) {
    if (!text) return '';
    return text.toString()
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/[^\w\s\-_.,$%/]/g, '') // Keep only safe characters
      .trim()
      .substring(0, 1000); // Limit length
  }

  sanitizePrice(price) {
    if (!price) return null;
    const numPrice = parseFloat(price.toString().replace(/[^\d.]/g, ''));
    return isNaN(numPrice) ? null : Math.max(0, Math.min(numPrice, 100000));
  }

  extractNumericValue(text, defaultValue = null) {
    if (!text) return defaultValue;
    const match = text.toString().match(/(\d+)/);
    return match ? parseInt(match[1]) : defaultValue;
  }
}

module.exports = new Validator();
