module.exports = {
  BOT: {
    COMMANDS: {
      START: 'start',
      LISTINGS: 'listings',
      PREFERENCES: 'preferences',
      HELP: 'help'
    },
    STATES: {
      ONBOARDING_LOCATION: 'onboarding_location',
      ONBOARDING_BUDGET: 'onboarding_budget',
      ONBOARDING_ROOMS: 'onboarding_rooms',
      ONBOARDING_DURATION: 'onboarding_duration',
      COMPLETE: 'complete'
    }
  },
  
  LOCATIONS: [
    'Canggu', 'Seminyak', 'Ubud', 'Sanur', 'Kuta',
    'Legian', 'Jimbaran', 'Nusa Dua', 'Uluwatu', 'Berawa'
  ],
  
  BUDGETS: [
    { text: 'Under $500', value: 500 },
    { text: '$500 - $1000', value: 1000 },
    { text: '$1000 - $2000', value: 2000 },
    { text: '$2000 - $5000', value: 5000 },
    { text: 'Above $5000', value: 10000 }
  ],
  
  ROOMS: [
    { text: 'Studio', value: 0 },
    { text: '1 Bedroom', value: 1 },
    { text: '2 Bedrooms', value: 2 },
    { text: '3+ Bedrooms', value: 3 }
  ],
  
  DURATIONS: [
    'Short term (1-3 months)',
    'Medium term (3-6 months)', 
    'Long term (6+ months)',
    'Flexible'
  ],
  
  SCRAPING: {
    MAX_LISTINGS_PER_SOURCE: 50,
    TIMEOUT: 30000,
    USER_AGENTS: [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ]
  }
};
