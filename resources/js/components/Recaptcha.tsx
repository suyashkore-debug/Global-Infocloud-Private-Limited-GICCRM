import { useEffect, useRef } from 'react';

type Grecaptcha = { ready: (cb: () => void) => void; render: (el: HTMLElement, opts: { sitekey: string }) => number; reset: (id?: number) => void };

declare global {
    interface Window {
        grecaptcha?: Grecaptcha;
    }
}

let loading: Promise<Grecaptcha> | null = null;

/** Google's script, loaded once for the page. */
function loadGrecaptcha(): Promise<Grecaptcha> {
    loading ??= new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
        script.async = true;
        script.onload = () => window.grecaptcha!.ready(() => resolve(window.grecaptcha!));
        script.onerror = () => {
            loading = null;
            reject(new Error('reCAPTCHA could not load'));
        };
        document.head.appendChild(script);
    });

    return loading;
}

/**
 * Google reCAPTCHA v2 ("I'm not a robot") inside a form: Google adds the hidden
 * g-recaptcha-response field, so the form's FormData carries the token. A new resetKey (after a
 * failed submit) asks for a fresh tick, since a token works only once.
 */
export default function Recaptcha({ siteKey, resetKey, error }: { siteKey: string; resetKey: number; error?: string }) {
    const box = useRef<HTMLDivElement>(null);
    const widget = useRef<number | null>(null);

    useEffect(() => {
        let gone = false;
        loadGrecaptcha()
            .then((g) => {
                if (!gone && box.current && widget.current === null) {
                    widget.current = g.render(box.current, { sitekey: siteKey });
                }
            })
            .catch(() => undefined);

        return () => {
            gone = true;
        };
    }, [siteKey]);

    useEffect(() => {
        if (resetKey > 0 && widget.current !== null) {
            window.grecaptcha?.reset(widget.current);
        }
    }, [resetKey]);

    return (
        <div>
            <div ref={box} />
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
    );
}
