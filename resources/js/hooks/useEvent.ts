import { useEffect, useRef } from 'react';
import { listen } from '../lib/events';

/** Run the handler whenever any of the named app events fires. */
export function useEvent(names: string[], handler: () => void): void {
    const saved = useRef(handler);
    saved.current = handler;
    const key = names.join('|');

    useEffect(() => {
        const offs = key.split('|').map((name) => listen(name, () => saved.current()));

        return () => offs.forEach((off) => off());
    }, [key]);
}
