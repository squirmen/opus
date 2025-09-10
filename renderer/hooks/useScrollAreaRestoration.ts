import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';

const DEBUG = false;

export function useScrollAreaRestoration(key: string) {
  const router = useRouter();
  const scrollPositions = useRef<{ [path: string]: number }>({});
  const isRestoring = useRef(false);
  const lastKnownScrollTop = useRef(0);

  useEffect(() => {
    const saved = sessionStorage.getItem(`scrollAreaPositions_${key}`);
    if (saved) {
      try {
        scrollPositions.current = JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse scroll positions:', e);
      }
    }

    const findScrollViewport = (): HTMLElement | null => {
      return document.querySelector('[data-radix-scroll-area-viewport]');
    };

    let scrollViewport: HTMLElement | null = null;

    const handleScroll = (e: Event): void => {
      if (!isRestoring.current && e.target) {
        const scrollTop = (e.target as HTMLElement).scrollTop;
        lastKnownScrollTop.current = scrollTop;
        scrollPositions.current[router.asPath] = scrollTop;
      }
    };

    const handleRouteChangeStart = (url: string): void => {
      const viewport = findScrollViewport();
      const scrollTop = viewport?.scrollTop ?? lastKnownScrollTop.current;
      
      if (DEBUG) {
        console.log(`[${key}] Saving position for ${router.asPath}: ${scrollTop}`);
      }
      
      scrollPositions.current[router.asPath] = scrollTop;
      sessionStorage.setItem(
        `scrollAreaPositions_${key}`,
        JSON.stringify(scrollPositions.current)
      );
    };

    const handleRouteChangeComplete = (url: string): void => {
      const savedPosition = scrollPositions.current[url];
      
      if (DEBUG) {
        console.log(`[${key}] Route complete to ${url}, saved position: ${savedPosition}`);
      }
      
      if (savedPosition && !isRestoring.current) {
        isRestoring.current = true;
        
        const attemptRestore = (attempts = 0): void => {
          if (attempts > 10) {
            isRestoring.current = false;
            return;
          }

          const viewport = findScrollViewport();
          if (viewport) {
            viewport.scrollTop = savedPosition;
            
            setTimeout(() => {
              const actualScroll = viewport.scrollTop;
              
              if (Math.abs(actualScroll - savedPosition) > 50) {
                viewport.scrollTop = savedPosition;
                
                setTimeout(() => {
                  isRestoring.current = false;
                  lastKnownScrollTop.current = viewport.scrollTop;
                }, 50);
              } else {
                isRestoring.current = false;
                lastKnownScrollTop.current = actualScroll;
              }
            }, 50);
          } else {
            setTimeout(() => attemptRestore(attempts + 1), 100);
          }
        };

        setTimeout(() => attemptRestore(), 100);
      }
    };

    const handlePopState = (): void => {
      setTimeout(() => {
        const position = scrollPositions.current[router.asPath];
        if (position > 0) {
          const viewport = findScrollViewport();
          if (viewport) {
            viewport.scrollTop = position;
          }
        }
      }, 100);
    };

    const setupViewportListener = (): void => {
      scrollViewport = findScrollViewport();
      if (scrollViewport) {
        scrollViewport.addEventListener('scroll', handleScroll, { passive: true });
        
        const currentPosition = scrollPositions.current[router.asPath];
        if (currentPosition > 0) {
          requestAnimationFrame(() => {
            if (scrollViewport) {
              scrollViewport.scrollTop = currentPosition;
            }
          });
        }
      } else {
        setTimeout(setupViewportListener, 100);
      }
    };

    setupViewportListener();
    
    router.events.on('routeChangeStart', handleRouteChangeStart);
    router.events.on('routeChangeComplete', handleRouteChangeComplete);
    window.addEventListener('popstate', handlePopState);

    return () => {
      if (scrollViewport) {
        scrollViewport.removeEventListener('scroll', handleScroll);
      }
      router.events.off('routeChangeStart', handleRouteChangeStart);
      router.events.off('routeChangeComplete', handleRouteChangeComplete);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [router, key]);

  const saveScrollPosition = (): void => {
    const viewport = document.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
    if (viewport) {
      scrollPositions.current[router.asPath] = viewport.scrollTop;
      sessionStorage.setItem(
        `scrollAreaPositions_${key}`,
        JSON.stringify(scrollPositions.current)
      );
    }
  };

  return { saveScrollPosition };
}