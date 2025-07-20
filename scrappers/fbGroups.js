const puppeteer = require('puppeteer');
const validator = require('../bot/utils/validator');
const logger = require('../bot/utils/logger');
require('dotenv').config();

class FacebookGroupsScraper {
  constructor() {
    this.groupUrls = [
      'https://www.facebook.com/groups/balimonthlyvillasandhouses',
      'https://www.facebook.com/groups/balirentalproperties',
      'https://www.facebook.com/groups/rentalinbali'
    ];
  }

  async scrape() {
    const browser = await puppeteer.launch({
      headless: process.env.NODE_ENV === 'production',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

      // Login to Facebook
      await this.loginToFacebook(page);

      const allListings = [];

      for (const groupUrl of this.groupUrls) {
        try {
          logger.info(`Scraping Facebook Group: ${groupUrl}`);
          const listings = await this.scrapeGroup(page, groupUrl);
          allListings.push(...listings);
          
          // Delay between groups
          await page.waitForTimeout(3000);
        } catch (error) {
          logger.error(`Error scraping group ${groupUrl}:`, error);
        }
      }

      return allListings;
    } catch (error) {
      logger.error('Facebook Groups scraping error:', error);
      throw error;
    } finally {
      await browser.close();
    }
  }

  async loginToFacebook(page) {
    try {
      await page.goto('https://www.facebook.com/login', { waitUntil: 'networkidle0' });
      
      await page.type('#email', process.env.FACEBOOK_EMAIL, { delay: 100 });
      await page.type('#pass', process.env.FACEBOOK_PASSWORD, { delay: 100 });
      
      await Promise.all([
        page.click('#loginbutton'),
        page.waitForNavigation({ waitUntil: 'networkidle0' })
      ]);

      // Handle potential security checks
      const currentUrl = page.url();
      if (currentUrl.includes('checkpoint') || currentUrl.includes('verify')) {
        throw new Error('Facebook account requires verification');
      }

      logger.info('Successfully logged into Facebook');
    } catch (error) {
      logger.error('Facebook login failed:', error);
      throw error;
    }
  }

  async scrapeGroup(page, groupUrl) {
    try {
      await page.goto(groupUrl, { waitUntil: 'networkidle0' });
      
      // Wait for posts to load
      await page.waitForSelector('[role="article"]', { timeout: 10000 });

      // Scroll to load more posts
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, 1000));
        await page.waitForTimeout(2000);
      }

      // Extract posts
      const posts = await page.evaluate(() => {
        const articles = document.querySelectorAll('[role="article"]');
        const results = [];

        articles.forEach((article) => {
          try {
            // Look for rental-related keywords
            const textContent = article.textContent.toLowerCase();
            const isRentalPost = /rent|rental|sewa|villa|house|room|apartment|studio|monthly/i.test(textContent);
            
            if (!isRentalPost) return;

            const postText = article.querySelector('[data-ad-preview="message"]')?.textContent ||
                           article.querySelector('[dir="auto"]')?.textContent || '';

            // Look for links within the post
            const linkElement = article.querySelector('a[href*="/posts/"], a[href*="/permalink/"]');
            const postUrl = linkElement ? 'https://www.facebook.com' + linkElement.getAttribute('href') : null;

            // Try to find images
            const images = Array.from(article.querySelectorAll('img'))
              .map(img => img.src)
              .filter(src => src && !src.includes('emoji') && !src.includes('static'));

            if (postText && postText.length > 20) {
              results.push({
                title: this.extractTitle(postText),
                description: postText.substring(0, 500),
                postUrl: postUrl,
                images: images.slice(0, 3)
              });
            }
          } catch (error) {
            console.warn('Error parsing post:', error);
          }
        });

        return results;
      });

      // Process and format posts
      const listings = posts.map(post => ({
        title: post.title,
        price: this.extractPrice(post.description),
        location: this.extractLocation(post.description),
        rooms: this.extractRooms(post.description),
        furnished: this.extractFurnished(post.description),
        description: validator.sanitizeText(post.description),
        image_urls: post.images,
        listing_url: post.postUrl || groupUrl,
        source: 'Facebook Groups'
      })).filter(listing => listing.title && listing.title.length > 5);

      logger.info(`Scraped ${listings.length} posts from group`);
      return listings.slice(0, 10); // Limit per group

    } catch (error) {
      logger.error('Error scraping group:', error);
      return [];
    }
  }

  extractTitle(text) {
    const lines = text.split('\n').filter(line => line.trim());
    let title = lines[0]?.trim() || '';
    
    // If first line is too short, combine with second line
    if (title.length < 15 && lines[1]) {
      title = `${title} ${lines[1].trim()}`;
    }

    return validator.sanitizeText(title.substring(0, 100));
  }

  extractPrice(text) {
    const pricePatterns = [
      /(?:rp|idr)\s*[\d.,]+(?:jt|juta|million)?/gi,
      /\$\s*[\d,]+(?:\/month|monthly)?/gi,
      /[\d,]+\s*(?:usd|dollar)/gi
    ];

    for (const pattern of pricePatterns) {
      const match = text.match(pattern);
      if (match) {
        const priceStr = match[0].replace(/[^\d]/g, '');
        const price = parseInt(priceStr);
        
        // Convert IDR to USD (rough conversion)
        if (text.toLowerCase().includes('rp') || text.toLowerCase().includes('idr')) {
          return Math.round(price / 15000);
        }
        
        return price;
      }
    }

    return null;
  }

  extractLocation(text) {
    const locations = [
      'canggu', 'seminyak', 'ubud', 'sanur', 'denpasar', 'kuta', 'legian',
      'jimbaran', 'nusa dua', 'uluwatu', 'pecatu', 'bingin', 'padang padang',
      'berawa', 'echo beach', 'batu bolong', 'pererenan'
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
    const roomMatch = text.match(/(\d+)\s*(?:bed|bedroom|room|br|kamar)/i);
    return roomMatch ? parseInt(roomMatch[1]) : 1;
  }

  extractFurnished(text) {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('furnished') || lowerText.includes('lengkap')) return true;
    if (lowerText.includes('unfurnished') || lowerText.includes('kosong')) return false;
    return null;
  }
}

module.exports = new FacebookGroupsScraper();
