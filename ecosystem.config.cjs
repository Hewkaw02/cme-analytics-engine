module.exports = {
  apps: [
    {
      name: 'cme-scheduler',
      script: './dist/main.js',
      args: '--mode scheduler',
      interpreter: 'node',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
