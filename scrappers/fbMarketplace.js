const puppeteer = require('puppeteer');
require('dotenv').config();

class FacebookMarketplaceScraper {
  async scrape() {
    const browser = await puppeteer.launch({
      headless: false, // Set to true for production
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

      // Navigate to Facebook login
      await page.goto('https://www.facebook.com/login');
      
      // Login with dummy account
      await page.type('#email', process.env.FACEBOOK_EMAIL);
      await page.type('#pass', process.env.FACEBOOK_PASSWORD);
      await page.click('#loginbutton');
      
      // Wait for login
      await page.waitForNavigation();

      // Navigate to marketplace
      const marketplaceUrl = 'https://www.facebook.com/marketplace/107286902636860/search?query=room%20to%20rent';
      await page.goto(marketplaceUrl);
      
      // Wait for listings to load
      await page.waitForSelector('[data-testid="marketplace-product-item"]', { timeout: 10000 });

      // Scroll to load more listings
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, 1000));
        await page.waitForTimeout(2000);
      }

      // Extract listings
      const listings = await page.evaluate(() => {
        const items = document.querySelectorAll('[data-testid="marketplace-product-item"]');
        const results = [];

        items.forEach((item, index) => {
          try {
            const titleElement = item.querySelector('span[dir="auto"]');
            const priceElement = item.querySelector('span[dir="auto"]'); // Price usually in first span
            const locationElement = item.querySelector('span[dir="auto"]:last-child');
            const linkElement = item.querySelector('a');
            const imageElement = item.querySelector('img');

            if (titleElement && linkElement) {
              results.push({
                title: titleElement.textContent.trim(),
                price: priceElement ? this.extractPrice(priceElement.textContent) : null,
                location: locationElement ? locationElement.textContent.trim() : 'Bali',
                rooms: this.extractRooms(titleElement.textContent),
                furnished: this.extractFurnished(titleElement.textContent),
                description: titleElement.textContent.trim(),
                image_urls: imageElement ? [imageElement.src] : [],
                listing_url: 'https://www.facebook.com' + linkElement.getAttribute('href'),
                source: 'Facebook Marketplace'
              });
            }
          } catch (error) {
            console.warn('Error parsing listing:', error);
          }
        });

        return results.slice(0, 20); // Limit to 20 listings
      });

      return listings;
    } catch (error) {
      console.error('Facebook Marketplace scraping error:', error);
      throw error;
    } finally {
      await browser.close();
    }
  }

  extractPrice(text) {
    const priceMatch = text.match(/[\$Rp,.\d]+/);
    if (priceMatch) {
      const price = priceMatch[0].replace(/[^\d]/g, '');
      return parseInt(price) || null;
    }
    return null;
  }

  extractRooms(text) {
    const roomMatch = text.match(/(\d+)\s*(room|bedroom|br)/i);
    return roomMatch ? parseInt(roomMatch[1]) : 1;
  }

  extractFurnished(text) {
    const furnished = /furnished/i.test(text);
    const unfurnished = /unfurnished/i.test(text);
    return furnished ? true : unfurnished ? false : null;
  }
}

module.exports = new FacebookMarketplaceScraper();
