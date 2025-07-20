const puppeteer = require('puppeteer');
const validator = require('../bot/utils/validator');
const logger = require('../bot/utils/logger');
const { SCRAPING } = require('../config/constants');

class FacebookGroupsScraper {
  constructor() {
    this.groups = [
      'https://www.facebook.com/groups/balimonthlyvillasandhouses',
      'https://www.facebook.com/groups/balirentalproperties',
      'https://www.facebook.com/groups/rentalinbali',
      'https://www.facebook.com/groups/balivillas',
      'https://www.facebook.com/groups/balipropertyrent'
    ];
  }

  async scrape() {
    let browser;
    try {
      logger.info('Starting Facebook Groups scraping...');
      
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      });

      const page = await browser.newPage();
      await page.setUserAgent(SCRAPING.USER_AGENTS[0]);

      // Optional: Login to Facebook if credentials provided
      if (process.env.FACEBOOK_EMAIL && process.env.FACEBOOK_PASSWORD) {
        await this.loginToFacebook(page);
      }

      const allListings = [];

      for (const groupUrl of this.groups) {
        try {
          logger.info(`Scraping Facebook Group: ${groupUrl}`);
          const groupListings = await this.scrapeGroup(page, groupUrl);
          allListings.push(...groupListings);
          
          // Rate limiting between groups
          await page.waitForTimeout(3000);
          
        } catch (error) {
          logger.error(`Error scraping group ${groupUrl}:`, error);
        }
      }

      const uniqueListings = this.deduplicateListings(allListings);
      logger.info(`Facebook Groups scraped ${uniqueListings.length} total listings`);
      
      return uniqueListings;

    } catch (error) {
      logger.error('Facebook Groups scraping error:', error);
      return [];
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  async loginToFacebook(page) {
    try {
      await page.goto('https://www.facebook.com/login', { waitUntil: 'networkidle2' });
      
      await page.type('#email', process.env.FACEBOOK_EMAIL);
      await page.type('#pass', process.env.FACEBOOK_PASSWORD);
      await page.click('[name="login"]');
      
      await page.waitForNavigation({ waitUntil: 'networkidle2' });
      logger.info('Successfully logged into Facebook');
      
    } catch (error) {
      logger.error('Facebook login error:', error);
    }
  }

  async scrapeGroup(page, groupUrl) {
    try {
      await page.goto(groupUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Wait for posts to load
      await page.waitForTimeout(5000);

      // Scroll to load more posts
      await this.scrollPage(page, 3);

      // Extract posts
      const posts = await page.evaluate(() => {
        const postElements = document.querySelectorAll('[role="article"], [data-pagelet="FeedUnit"]');
        const results = [];

        postElements.forEach((post, index) => {
          if (index >= 10) return; // Limit posts per group

          try {
            const textContent = post.textContent?.toLowerCase() || '';
            
            // Filter for rental-related posts
            if (textContent.includes('rent') || 
                textContent.includes('sewa') || 
                textContent.includes('monthly') ||
                textContent.includes('villa') ||
                textContent.includes('house') ||
                textContent.includes('room')) {
              
              const titleElement = post.querySelector('[data-ad-preview="message"]') || 
                                 post.querySelector('div[dir="auto"]');
              const title = titleElement?.textContent?.trim();
              
              const linkElement = post.querySelector('a[href*="/groups/"][href*="/posts/"]') ||
                                post.querySelector('a[href*="/groups/"][href*="/permalink/"]');
              const link = linkElement?.href;
              
              const imageElement = post.querySelector('img[src*="scontent"]');
              const image = imageElement?.src;
              
              if (title && title.length > 20 && link) {
                results.push({
                  title: title.substring(0, 500),
                  text: textContent.substring(0, 1000),
                  link,
                  image
                });
              }
            }
          } catch (e) {
            console.log('Error processing post:', e);
          }
        });

        return results;
      });

      // Format posts into listings
      const listings = posts.map(post => {
        const price = validator.extractPrice(post.text);
        
        return {
          title: validator.sanitizeText(post.title),
          price: price,
          location: this.extractLocation(post.text),
          rooms: this.extractRooms(post.text),
          furnished: this.extractFurnished(post.text),
          description: validator.sanitizeText(post.text.substring(0, 500)),
          image_urls: post.image ? [post.image] : [],
          listing_url: post.link,
          source: 'Facebook Groups',
          scraped_at: new Date().toISOString()
        };
      }).filter(listing => validator.validateListing(listing).isValid);

      logger.info(`Found ${listings.length} listings in group: ${groupUrl}`);
      return listings;

    } catch (error) {
      logger.error(`Error scraping group ${groupUrl}:`, error);
      return [];
    }
  }

  async scrollPage(page, times) {
    for (let i = 0; i < times; i++) {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(2000);
    }
  }

  extractLocation(text) {
    const locations = [
      'canggu', 'seminyak', 'ubud', 'sanur', 'denpasar',
      'kuta', 'legian', 'jimbaran', 'nusa dua', 'uluwatu'
    ];
    
    const lowerText = text.toLowerCase();
    for (const location of locations) {
      if (lowerText.includes(location)) {
        return location.charAt(0).toUpperCase() + location.slice(1);
      }
    }
    return 'Bali';
  }

  extractRooms(text) {
    if (/studio/i.test(text)) return 0;
    
    const match = text.match(/(\d+)\s*(?:bedroom|bed|room|br|kamar)/i);
    if (match) {
      const rooms = parseInt(match[1]);
      return rooms >= 0 && rooms <= 10 ? rooms : 1;
    }
    return 1;
  }

  extractFurnished(text) {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('furnished')) return true;
    if (lowerText.includes('unfurnished')) return false;
    return null;
  }

  deduplicateListings(listings) {
    const seen = new Set();
    return listings.filter(listing => {
      if (seen.has(listing.listing_url)) return false;
      seen.add(listing.listing_url);
      return true;
    });
  }
}

module.exports = new FacebookGroupsScraper();
