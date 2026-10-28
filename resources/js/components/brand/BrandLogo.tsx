/** GIC Folks brand colours (from the HRMS "GIC Folks" logo). */
export const BRAND = { navy: '#0b2c56', orange: '#fa6010' };

/**
 * "GIC Folks CRM" logo: the same GIC Folks logo as the HRMS login, with an orange CRM badge.
 * Use `light` on dark backgrounds (white logo).
 */
export default function BrandLogo({ size = 'md', light = false }: { size?: 'sm' | 'md' | 'lg'; light?: boolean }) {
    const height = size === 'lg' ? 'h-11' : size === 'sm' ? 'h-7' : 'h-9';
    const badge = size === 'lg' ? 'text-[13px] px-2 py-0.5' : size === 'sm' ? 'text-[10px] px-1.5 py-[1px]' : 'text-[11px] px-1.5 py-0.5';

    return (
        <span className="inline-flex items-center gap-2" aria-label="GIC Folks CRM">
            <img src={light ? '/images/gic-folks-logo-white.png' : '/images/gic-folks-logo.png'} alt="GIC Folks" className={`${height} w-auto`} />
            <span className={`rounded-md font-bold tracking-wider text-white ${badge}`} style={{ background: BRAND.orange }}>
                CRM
            </span>
        </span>
    );
}

/** The stacked GIC Folks logo (as on the HRMS login page) with the CRM badge, for login pages. */
export function StackedBrandLogo({ className = 'h-24' }: { className?: string }) {
    return (
        <span className="inline-flex flex-col items-center gap-2" aria-label="GIC Folks CRM">
            <img src="/images/gic-folks-logo-stacked.png" alt="GIC Folks" className={`${className} w-auto`} />
            <span className="rounded-md px-2 py-0.5 text-[12px] font-bold tracking-[0.2em] text-white" style={{ background: BRAND.orange }}>
                CRM
            </span>
        </span>
    );
}
