import { createContext, useContext } from 'react';
import type { ProgressSnapshot } from './progressStore';
import type { GuideKey } from './catalog';

export interface TargetRect { x: number; y: number; width: number; height: number }
export interface TutorialPageState { owner: string; guide: GuideKey; ready: boolean; hasItems: boolean }
export interface TutorialRun { owner: string; guide: GuideKey; phase: 'intro' | 'steps'; stepId: string | null }
export interface TutorialAnchor {
  reveal: () => Promise<void>;
  measure: () => Promise<TargetRect | null>;
  enter?: () => void;
  leave?: () => void;
}
export interface TutorialValue {
  page: TutorialPageState | null;
  run: TutorialRun | null;
  progress: ProgressSnapshot;
  admin: boolean;
  activate: (page: TutorialPageState) => void;
  updatePage: (owner: string, patch: Partial<Pick<TutorialPageState, 'ready' | 'hasItems'>>) => void;
  deactivate: (owner: string) => void;
  register: (key: string, anchor: TutorialAnchor) => () => void;
  anchor: (key: string) => TutorialAnchor | undefined;
  startCurrent: () => void;
  launch: (guide: GuideKey, restart?: boolean) => Promise<void>;
  begin: (restart?: boolean) => void;
  next: () => void;
  previous: () => void;
  close: () => void;
  notify: (event: string) => void;
  sync: () => Promise<void>;
}
export const TutorialContext = createContext<TutorialValue | null>(null);
export const TutorialPageContext = createContext<{ owner: string; guide: GuideKey } | null>(null);
export function useTutorial(): TutorialValue {
  const value = useContext(TutorialContext);
  if (!value) throw new Error('Falta el proveedor de tutoriales');
  return value;
}
