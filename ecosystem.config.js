module.exports = {
  apps: [
    {
      name: 'charity-bot-worker',
      script: './dist/worker.js',
      cwd: './',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        USE_MOCK_KRAKEN: 'true',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        USE_MOCK_KRAKEN: 'false',
        KRAKEN_API_KEY: process.env.KRAKEN_API_KEY,
        KRAKEN_API_SECRET: process.env.KRAKEN_API_SECRET,
        DB_HOST: process.env.DB_HOST,
        DB_PORT: process.env.DB_PORT,
        DB_NAME: process.env.DB_NAME,
        DB_USER: process.env.DB_USER,
        DB_PASSWORD: process.env.DB_PASSWORD,
        LOG_LEVEL: 'info',
        LOG_TO_FILE: 'true',
      },
      error_file: './logs/worker-error.log',
      out_file: './logs/worker-output.log',
      log_file: './logs/worker-combined.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: false,
      kill_timeout: 5000,
      listen_timeout: 3000,
      shutdown_with_message: true,
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      instance_var: 'INSTANCE_ID',
    },
  ],
  deploy: {
    production: {
      user: 'ubuntu',
      host: ['your-production-server.com'],
      ref: 'origin/main',
      repo: 'git@github.com:your-username/charity-bot-v1.git',
      path: '/home/ubuntu/charity-bot-v1',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
    },
    staging: {
      user: 'ubuntu',
      host: ['staging-server.com'],
      ref: 'origin/develop',
      repo: 'git@github.com:your-username/charity-bot-v1.git',
      path: '/home/ubuntu/charity-bot-v1-staging',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env staging',
    },
  },
};

// PM2 Commands:
// Development: pm2 start ecosystem.config.js --env development
// Production: pm2 start ecosystem.config.js --env production
// Restart: pm2 restart charity-bot-worker
// Stop: pm2 stop charity-bot-worker
// Delete: pm2 delete charity-bot-worker
// Logs: pm2 logs charity-bot-worker
// Monitor: pm2 monit
// Status: pm2 status
// Reload: pm2 reload ecosystem.config.js --env production