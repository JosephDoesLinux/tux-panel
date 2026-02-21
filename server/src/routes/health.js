/**
 * /api/health — lightweight liveness & readiness probe
 */

const { Router } = require('express');
const os = require('os');

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    nodeVersion: process.version,
  });
});

module.exports = router;
