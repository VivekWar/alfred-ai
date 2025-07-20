const logger = require('../bot/utils/logger');
const database = require('../bot/utils/database');

// Import all scrapers
const fbMarketplace = require('./fbMarketplace');
const fbGroups = require('./fbGroups');
const homeImmo = require('./homeImmo');
const rentRoomBali = require('./rentRoomBali');
const rumahKost = require('./rumahKost');
const villaHub = require('./villaHub');

class ScrapingService {
  constructor() {
    this.scrapers = [
      { name: 'Facebook Marketplace', scraper: fbMarketplace },
      { name: 'Facebook Groups', scraper: fbGroups },
      { name: 'Villa Hub Bali', scraper: villaHub },
      { name: 'Rent Room Bali', scraper: rentRoomBali },
      { name: 'Rumah Kost', scraper: rumahKost },
      { name: 'Home Immo', scraper: homeImmo }
    ];
  }

  async runAllScrapers() {
    logger.info('🚀 Starting scraping process...');
    
    let totalListings = 0;
    const results = [];

    for (const { name, scraper } of this.scrapers) {
      try {
        logger.info(`🔍 Scraping ${name}...`);
        const startTime = Date.now();
        
        const listings = await scraper.scrape();
        const duration = Date.now() - startTime;
        
        if (listings && listings.length > 0) {
          await database.saveListings(listings);
          totalListings += listings.length;
          
          results.push({
            name,
            count: listings.length,
            status: 'success',
            duration
          });
          
          logger.info(`✅ ${name}: ${listings.length} listings (${duration}ms)`);
        } else {
          results.push({
            name,
            count: 0,
            status: 'no_data',
            duration
          });
          
          logger.warn(`⚠️ ${name}: No listings found`);
        }

        // Rate limiting
        await this.delay(2000);

      } catch (error) {
        logger.error(`❌ ${name} failed:`, error.message);
        results.push({
          name,
          count: 0,
          status: 'error',
          error: error.message
        });
      }
    }

    logger.info(`🎉 Scraping complete! Total listings: ${totalListings}`);
    return { totalListings, results };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run if called directly
if (require.main === module) {
  const service = new ScrapingService();
  service.runAllScrapers()
    .then(result => {
      console.log('Scraping completed:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Scraping failed:', error);
      process.exit(1);
    });
}

module.exports = new ScrapingService();
