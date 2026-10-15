import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface TokenPayload {
  sub: number;
}

export function signToken(userId: number): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, config.jwtSecret);
  if (typeof decoded === 'string' || typeof decoded.sub !== 'number') {
    throw new Error('Token inválido');
  }
  return { sub: decoded.sub };
}
