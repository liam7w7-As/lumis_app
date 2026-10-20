import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { AppState, Keyboard, View } from 'react-native';
import { router, type Href } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { feedback, getFeedbackSnapshot, subscribeFeedback } from '../lib/feedback';
import { GUIDE_KEYS, GUIDES, GUIDE_VERSION, stepPosition, stepsFor, type GuideKey } from './catalog';
import { createProgressStore, type LocalProgress } from './progressStore';
import { TutorialContext, type TutorialAnchor, type TutorialPageState, type TutorialRun } from './TutorialContext';
import { TutorialLayer } from './TutorialLayer';

export function TutorialProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  if (!user || !token) return children;
  return <TutorialSession key={user.businessId + ':' + user.id + ':' + token} userId={user.id}
    businessId={user.businessId} token={token} admin={user.role === 'admin'}>{children}</TutorialSession>;
}
function TutorialSession({ userId, businessId, token, admin, children }: {
  userId: number; businessId: number; token: string; admin: boolean; children: ReactNode;
}) {
  const store = useMemo(() => {
    const key = (guide: string) => 'lumis_guide_' + businessId + '_' + userId + '_' + guide + '_v' + GUIDE_VERSION;
    return createProgressStore({
      readLocal: async () => (await Promise.all(GUIDE_KEYS.map(async (guide) => {
        try { const raw = await SecureStore.getItemAsync(key(guide)); return raw ? JSON.parse(raw) as LocalProgress : null; }
        catch { return null; }
      }))).filter((record): record is LocalProgress => !!record && typeof record.guide === 'string'),
      writeLocal: (record) => SecureStore.setItemAsync(key(record.guide), JSON.stringify(record)),
      readRemote: () => api.tutorials(token).then((result) => result.progress),
      writeRemote: (record) => api.saveTutorial(record.guide, { version: record.version, status: record.status,
        stepId: record.stepId }, token).then((result) => result.progress),
    });
  }, [userId, businessId, token]);
  const progress = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const feedbackState = useSyncExternalStore(subscribeFeedback, getFeedbackSnapshot, getFeedbackSnapshot);
  const [page, setPage] = useState<TutorialPageState | null>(null);
  const [run, setRun] = useState<TutorialRun | null>(null);
  const [requested, setRequested] = useState<{ guide: GuideKey; restart: boolean } | null>(null);
  const anchors = useRef(new Map<string, TutorialAnchor>());
  const offered = useRef(new Set<GuideKey>());
  const resume = useRef(new Set<GuideKey>());

  useEffect(() => {
    void store.initialize();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void store.refresh();
    });
    return () => { subscription.remove(); };
  }, [store]);
  const activate = useCallback((next: TutorialPageState) => setPage(next), []);
  const updatePage = useCallback((owner: string, patch: Partial<Pick<TutorialPageState, 'ready' | 'hasItems'>>) => {
    setPage((current) => current?.owner === owner && (current.ready !== patch.ready || current.hasItems !== patch.hasItems)
      ? { ...current, ...patch } : current);
  }, []);
  const deactivate = useCallback((owner: string) => {
    setPage((current) => current?.owner === owner ? null : current);
    setRun((current) => current?.owner === owner ? null : current);
  }, []);
  const register = useCallback((key: string, anchor: TutorialAnchor) => {
    anchors.current.set(key, anchor);
    return () => { if (anchors.current.get(key) === anchor) anchors.current.delete(key); };
  }, []);
  const anchor = useCallback((key: string) => anchors.current.get(key), []);
  const currentSteps = useMemo(() => run && page ? stepsFor(run.guide, { admin, hasItems: page.hasItems }) : [], [run, page, admin]);
  const finish = useCallback((completed: boolean) => {
    if (!run) return;
    const old = store.getSnapshot().records[run.guide];
    const status = completed || old?.status === 'completed' ? 'completed' : 'skipped';
    store.save(run.guide, status, status === 'completed' ? null : run.stepId ?? old?.stepId ?? null);
    resume.current.delete(run.guide);
    offered.current.add(run.guide);
    setRun(null);
    Keyboard.dismiss();
  }, [run, store]);
  const go = useCallback((index: number) => {
    if (!run) return;
    const step = currentSteps[index];
    if (!step) { finish(true); return; }
    Keyboard.dismiss();
    resume.current.add(run.guide);
    store.save(run.guide, 'in_progress', step.id);
    setRun({ ...run, phase: 'steps', stepId: step.id });
  }, [run, currentSteps, store, finish]);
  const begin = useCallback((restart = false) => {
    if (!run) return;
    const saved = store.getSnapshot().records[run.guide];
    go(restart || saved?.status === 'completed' ? 0 : stepPosition(currentSteps, saved?.stepId));
  }, [run, store, go, currentSteps]);
  const next = useCallback(() => go(stepPosition(currentSteps, run?.stepId) + 1), [go, currentSteps, run?.stepId]);
  const previous = useCallback(() => go(Math.max(0, stepPosition(currentSteps, run?.stepId) - 1)), [go, currentSteps, run?.stepId]);
  const close = useCallback(() => finish(false), [finish]);
  const notify = useCallback((event: string) => {
    if (run?.phase === 'steps' && currentSteps[stepPosition(currentSteps, run.stepId)]?.event === event) next();
  }, [run, currentSteps, next]);
  const startCurrent = useCallback(() => {
    if (!page) return;
    Keyboard.dismiss();
    setRequested({ guide: page.guide, restart: false });
    if (run) setRun(null);
  }, [page, run]);
  const launch = useCallback(async (guide: GuideKey, restart = false) => {
    let actual = guide;
    let route = GUIDES[guide].route;
    try {
      if (guide === 'quote-detail' || guide === 'pdf') {
        const { quotes } = await api.quotes(token);
        if (quotes[0]) route = '/quotes/' + quotes[0].id + (guide === 'pdf' ? '/preview' : '');
        else if (guide === 'pdf') {
          const { sales } = await api.sales(token);
          if (sales[0]) route = '/pos/' + sales[0].id + '/preview';
          else { actual = 'quote-create'; route = GUIDES[actual].route; }
        } else { actual = 'quote-create'; route = GUIDES[actual].route; }
      } else if (guide === 'sale-detail') {
        const { sales } = await api.sales(token);
        if (sales[0]) route = '/pos/' + sales[0].id;
        else { actual = 'sale-editor'; route = GUIDES[actual].route; }
      }
      setRequested({ guide: actual, restart });
      Keyboard.dismiss();
      if (page?.guide === actual) setRun(null);
      router.push(route as Href);
    } catch (error) {
      feedback.error('No se pudo abrir la guía', error instanceof Error ? error.message : 'Comprueba tu conexión e inténtalo de nuevo.');
    }
  }, [token, page]);
  useEffect(() => {
    if (!page?.ready || !progress.ready || run || feedbackState.messages.length > 0) return;
    const saved = progress.records[page.guide];
    const manual = requested?.guide === page.guide;
    const continuing = resume.current.has(page.guide) && saved?.status === 'in_progress';
    if (!manual && !continuing && (saved || !progress.online || offered.current.has(page.guide))) return;
    const timer = setTimeout(() => {
      offered.current.add(page.guide);
      if (manual) setRequested(null);
      if (continuing && !manual) {
        setRun({ owner: page.owner, guide: page.guide, phase: 'steps', stepId: saved?.stepId ?? null });
      } else {
        const reset = manual && requested?.restart;
        setRun({ owner: page.owner, guide: page.guide, phase: 'intro', stepId: reset ? null : saved?.stepId ?? null });
        if (reset) store.save(page.guide, 'in_progress', null);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [page, progress, run, requested, feedbackState.messages.length, store]);
  const value = useMemo(() => ({ page, run, progress, admin, activate, updatePage, deactivate, register, anchor,
    startCurrent, launch, begin, next, previous, close, notify, sync: store.refresh }),
  [page, run, progress, admin, activate, updatePage, deactivate, register, anchor, startCurrent, launch, begin,
    next, previous, close, notify, store.refresh]);
  return <TutorialContext.Provider value={value}>
    <View style={{ flex: 1 }}>{children}<TutorialLayer hidden={feedbackState.messages.length > 0} /></View>
  </TutorialContext.Provider>;
}
