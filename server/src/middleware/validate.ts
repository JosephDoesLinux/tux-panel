import { z  } from 'zod';
import logger from '../utils/logger';
import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to validate request body, query, or params against a Zod schema.
 * @param {z.ZodSchema} schema - The Zod schema to validate against.
 * @param {'body' | 'query' | 'params'} property - The request property to validate.
 */
const validate = (schema: z.ZodSchema, property: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = schema.parse(req[property]);
      req[property] = validatedData; // Replace with sanitized data
      next();
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        logger.warn(`Validation failed for ${req.method} ${req.originalUrl}: ${(error as any).errors.map((e: any) => e.message).join(', ')}`);
        return res.status(400).json({
          error: 'Invalid input',
          details: (error as any).errors.map((e: any) => ({ path: e.path.join('.'), message: e.message }))
        });
      }
      next(error);
    }
  };
};

export default validate;
