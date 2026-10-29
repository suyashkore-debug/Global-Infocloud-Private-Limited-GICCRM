import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

/** GIC Folks colours: navy, orange, white and a win green. */
const COLORS = ['#0b2c56', '#164479', '#fa6010', '#ff9a52', '#ffffff', '#1baf7a'];

/**
 * A short burst of confetti for a win (a lead becomes a customer, an invoice is paid): one burst
 * from the middle, then one from each side. Skipped for people who turned motion off.
 */
export function celebrate() {
    const base = { colors: COLORS, zIndex: 9999, disableForReducedMotion: true, ticks: 220 };
    void confetti({ ...base, particleCount: 90, spread: 75, startVelocity: 45, origin: { x: 0.5, y: 0.6 } });
    setTimeout(() => {
        void confetti({ ...base, particleCount: 55, angle: 60, spread: 60, origin: { x: 0, y: 0.75 } });
        void confetti({ ...base, particleCount: 55, angle: 120, spread: 60, origin: { x: 1, y: 0.75 } });
    }, 200);
}

/**
 * Celebrates when a condition turns true while the screen is open (e.g. an invoice's status
 * becomes Paid after recording a payment), not when the screen opens on something already won.
 */
export function useCelebrateWhen(condition: boolean | undefined, record?: number | string) {
    const previous = useRef<{ record?: number | string; value?: boolean }>({});
    useEffect(() => {
        if (condition === undefined) {
            return;
        }
        // Opening another record starts over: only a change on the same record counts.
        if (previous.current.record === record && previous.current.value === false && condition) {
            celebrate();
        }
        previous.current = { record, value: condition };
    }, [condition, record]);
}
