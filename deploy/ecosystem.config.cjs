// pm2 start deploy/ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'orlova-lash',
      script: 'src/server.js',
      cwd: __dirname + '/..',
      instances: 1, // SQLite и rate limit в памяти: один процесс
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '300M',
    },
  ],
};
