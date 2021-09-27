import { ReactNode, useMemo } from 'react';
import {
  useCallback,
  useRef,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import UniversalRouter, { Route, RouterOptions, Routes } from 'universal-router';
import { createBrowserHistory, History, Path } from 'history';
import { createPath, parsePath } from 'history';
import { createCurrentGuard } from '@@/util';

export type RouterContext = {
  router: UniversalRouter;
  history: History;
  view: ReactNode;
  setView(view: ReactNode): void;
  setProgress(progress?: number): void;
  navigate: (to: string, state?: any) => void;
};
const Context = createContext<RouterContext | null>(null);
const ProgressContext = createContext<number | undefined>(undefined);

type Location<T = any> = Path & { state: T };
type HistoryState = { locationStack: Location[]; index?: number } | null;
type Props<R = any, C extends RouterContext = RouterContext> = {
  children: ReactNode;
  routes: Routes<R, C> | Route<R, C>;
} & RouterOptions<R, C>;

const [currentGuard, cancelOther] = createCurrentGuard();

export function BaseRouter<R = any, C extends RouterContext = RouterContext>({ routes, history, children, ...rest }: Props<R, C> & {history: History<HistoryState>}) {
  const router = useMemo(() => new UniversalRouter<R, C>(routes, rest), [routes, ...Object.values(rest)]);
  const [progress, setProgress] = useState<number>();
  const [view, setView] = useState<ReactNode>();
  const viewStackRef = useRef<any>([]);
  const locationStackRef = useRef<Location[]>([history.location]);

  useEffect(() => {
    const locationStack = history.location.state?.locationStack || locationStackRef.current;
    locationStackRef.current = locationStack;

    setProgress(0);
    Promise.all(
      locationStack.map((l) =>
        router.resolve({
          pathname: createPath(l),
          location: l,
        })
      )
    )
      .then((views) => {
        viewStackRef.current = views;
        history.replace(createPath(history.location), history.location.state);
        setProgress(1);
      })
      .finally(() => setProgress(undefined));
  }, [router]);

  useEffect(() => {
    return history.listen(({ action, location }) => {
      cancelOther();

      const index = location.state?.index || 0;
      setView(viewStackRef.current[index]);

      if (action === 'POP') {
        history.replace(createPath(history.location), {
          ...history.location.state,
          locationStack: locationStackRef.current,
        });
      }
    });
  }, [history]);

  const navigate = useCallback((to, state) => {
    setProgress(0);
    to = router.baseUrl + to;
    const location = { pathname: '', query: '', hash: '', ...parsePath(to), state } as Location;
    const nextIndex = (history.location.state?.index || 0) + 1;

    currentGuard(
      router.resolve({
        pathname: location.pathname,
        location,
      })
    )
      .then((view) => {
        locationStackRef.current = [...locationStackRef.current.slice(0, nextIndex), location];
        viewStackRef.current = [...viewStackRef.current.slice(0, nextIndex), view];
        history.push(to, {
          index: nextIndex,
          locationStack: locationStackRef.current,
        });
        setProgress(1);
      })
      .finally(() => setProgress(undefined));
  }, [router]);

  return (
    <Context.Provider {...rest} value={{ history, router, setProgress, view, setView, navigate }}>
      <ProgressContext.Provider value={progress}>{typeof children === 'undefined' ? view : children}</ProgressContext.Provider>
    </Context.Provider>
  );
}

export function Router<R = any, C extends RouterContext = RouterContext>(props: Props<R, C>) {
  const history = createBrowserHistory() as History<HistoryState>;
  return <BaseRouter {...props} history={history} />;
}

export function useRouter() {
  return useContext(Context)!;
}

export function useProgress() {
  return useContext(ProgressContext);
}

export function View() {
  const { view } = useRouter();
  return <>{view}</>;
}