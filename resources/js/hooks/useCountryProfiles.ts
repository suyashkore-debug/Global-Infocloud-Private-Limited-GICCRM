import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/** What a country sets up: its timezone, currency, phone code, number format and tax number. */
export type CountryProfile = {
    timezone: string;
    currency: string;
    symbol: string;
    phone_code: string;
    locale: string;
    tax_label: string;
    /** The tax number's format (GSTIN, TRN, VAT …) when known; any text otherwise. */
    tax_pattern: string | null;
    tax_example: string | null;
    /** India: a PAN besides the GSTIN. */
    has_pan: boolean;
};

export type CountryData = { profiles: Record<string, CountryProfile>; timezones: string[] };

let cache: Promise<CountryData> | null = null;

/** The countries and the server's timezones, fetched once (shared by every form). */
export function loadCountryData(): Promise<CountryData> {
    cache ??= api
        .get<{ data: Record<string, CountryProfile>; timezones: string[] }>('/company-signup/countries')
        .then((r) => ({ profiles: r.data.data, timezones: r.data.timezones }))
        .catch((e) => {
            cache = null;
            throw e;
        });

    return cache;
}

export function useCountryProfiles(): Record<string, CountryProfile> {
    const [profiles, setProfiles] = useState<Record<string, CountryProfile>>({});

    useEffect(() => {
        let active = true;
        loadCountryData()
            .then((d) => active && setProfiles(d.profiles))
            .catch(() => undefined);

        return () => {
            active = false;
        };
    }, []);

    return profiles;
}

/** A tax number normalized as the server stores it: upper case, no spaces or dots. */
export const normalizeTax = (value: string) => value.toUpperCase().replace(/[\s.]+/g, '');

export type TaxInfo = { label: string; example: string | null; pattern: string | null; hasPan: boolean };

/**
 * How a tax number is called and written in a country (the company's own when none is chosen).
 * The company's own country uses its label from Setup.
 */
export function taxInfo(profiles: Record<string, CountryProfile>, country: string | null | undefined, companyCountry?: string | null, companyLabel?: string | null): TaxInfo {
    const own = companyCountry || 'India';
    const name = country || own;
    const profile = profiles[name];
    const label = name === own && companyLabel ? companyLabel : (profile?.tax_label ?? (name === 'India' ? 'GSTIN' : 'Tax ID'));

    return { label, example: profile?.tax_example ?? null, pattern: profile?.tax_pattern ?? null, hasPan: profile ? profile.has_pan : name === 'India' };
}

/** A hint for a typed tax number that does not fit the country's format (null when it fits or is empty). */
export function taxProblem(info: TaxInfo, value: string): string | null {
    const v = normalizeTax(value);
    if (!v || !info.pattern || new RegExp(info.pattern).test(v)) {
        return null;
    }

    return `Doesn't look like a valid ${info.label}${info.example ? `, e.g. ${info.example}` : ''}.`;
}

/** The PAN inside a valid Indian GSTIN (characters 3 to 12). */
export function panFromGstin(info: TaxInfo, gstin: string): string | null {
    const v = normalizeTax(gstin);

    return info.hasPan && info.pattern && v.length === 15 && new RegExp(info.pattern).test(v) ? v.slice(2, 12) : null;
}
