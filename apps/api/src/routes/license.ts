import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middlewares/requireAuth';
import { licenseSnapshot } from '../lib/licenses';
export const licenseRouter = Router();
licenseRouter.get('/', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ license: await licenseSnapshot(req.businessId!, req.userId!) });
  } catch (err) {
    next(err);
  }
});
