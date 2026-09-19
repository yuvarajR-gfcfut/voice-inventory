import express from 'express';
import helmet from 'helmet';
import crypto from 'node:crypto';
import healthRouter from './routes/health.js';
import cronRouter from './routes/cron.js';
import configRouter from './routes/config.js';
import meRouter from './routes/me.js';
import productsRouter from './routes/products.js';
import parseRouter from './routes/parse.js';
import { errorHandler } from './middleware/error.js';
import { AppError } from './lib/errors.js';

const app = express();

app.disable('x-powered-by');

app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  const start = performance.now();

  res.on('finish', () => {
    const ms = Math.round((performance.now() - start) * 100) / 100;
    console.log(
      JSON.stringify({
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        ms
      })
    );
  });

  next();
});

app.use(express.json({ limit: '50kb' }));

const apiRouter = express.Router();
apiRouter.use(helmet());

apiRouter.use(healthRouter);
apiRouter.use(cronRouter);
apiRouter.use(configRouter);
apiRouter.use(meRouter);
apiRouter.use('/products', productsRouter);
apiRouter.use('/parse', parseRouter);

apiRouter.use((req, res, next) => {
  next(new AppError(404, 'NOT_FOUND', 'Endpoint not found'));
});

apiRouter.use(errorHandler);

app.use('/api', apiRouter);

app.get('/', (req, res) => {
  res.redirect('/stocksathi_home_dashboard.html');
});

export default app;
