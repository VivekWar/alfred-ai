module.exports = {
  // Bot configuration
  BOT: {
    COMMANDS: {
      START: 'start',
      LISTINGS: 'listings',
      PREFERENCES: 'preferences',
      HELP: 'help',
      STATS: 'stats'
    },
    
    MESSAGES: {
      WELCOME: '🏠 Welcome to Alfred.ai! Your personal Bali rental assistant.',
      ERROR_GENERIC: '❌ Something went wrong. Please try again later.',
      NO_LISTINGS: '🔍 No listings found matching your preferences today.',
      PREFERENCES_SAVED: '✅ Your preferences have been saved!',
      SCRAPING_START: '🔍 Searching for new listings...',
      SCRAPING_COMPLETE: '✅ Found new listings for you!'
    }
  },

  // Scraping configuration
  SCRAPING: {
    MAX_LISTINGS_PER_SOURCE: 20,
    TIMEOUT: 15000,
    USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    
    SOURCES: {
      FACEBOOK_MARKETPLACE: 'Facebook Marketplace',
      FACEBOOK_GROUPS: 'Facebook Groups',
      RUMAH_KOST: 'Rumah Kost Bali',
      VILLA_HUB: 'Bali Villa Hub',
      HOME_IMMO: 'Bali Home Immo',
      RENT_ROOM_BALI: 'RentRoomBali'
    },

    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 2000
  },

  // Location mappings
  LOCATIONS: {
    POPULAR: [
      'Canggu', 'Seminyak', 'Ubud', 'Sanur', 'Denpasar',
      'Kuta', 'Legian', 'Jimbaran', 'Nusa Dua', 'Uluwatu'
    ],
    
    ALIASES: {
      'echo beach': 'Canggu',
      'batu bolong': 'Canggu',
      'berawa': 'Canggu',
      'pererenan': 'Canggu',
      'petitenget': 'Seminyak',
      'monkey forest': 'Ubud',
      'central ubud': 'Ubud'
    }
  },

  // Price ranges (USD)
  PRICE_RANGES: {
    BUDGET: { min: 0, max: 500 },
    MID_RANGE: { min: 500, max: 1200 },
    LUXURY: { min: 1200, max: 5000 },
    ULTRA_LUXURY: { min: 5000, max: 50000 }
  },

  // Database configuration
  DATABASE: {
    BATCH_SIZE: 50,
    MAX_LISTING_AGE_DAYS: 30,
    CLEANUP_INTERVAL_HOURS: 24
  },

  // Telegram limits
  TELEGRAM: {
    MAX_MESSAGE_LENGTH: 4096,
    MAX_CAPTION_LENGTH: 1024,
    MAX_KEYBOARD_BUTTONS: 100,
    RATE_LIMIT_DELAY: 1000
  }
};
