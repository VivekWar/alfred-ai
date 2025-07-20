module.exports = {
  apps: [
    {
      name: 'alfred-ai-bot',
      script: 'index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'alfred-ai-scraper',
      script: 'scrappers/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      cron_restart: '0 */6 * * *', // Every 6 hours
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'alfred-ai-digest',
      script: 'services/dailyDigest.js',
      instances: 1,
      autorestart: true,
      watch: false,
      cron_restart: '0 9 * * *', // Daily at 9 AM
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
