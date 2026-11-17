import { useEffect, useState } from 'react';
import { TIMEZONES } from '../lib/countries';
import { loadCountryData } from './useCountryProfiles';

/** The timezones the server accepts (its current IANA names), fetched once; the browser's list until then. */
export function useTimezones(): string[] {
    const [zones, setZones] = useState<string[]>(TIMEZONES);

    useEffect(() => {
        let active = true;
        loadCountryData()
            .then((d) => active && setZones(d.timezones))
            .catch(() => undefined);

        return () => {
            active = false;
        };
    }, []);

    return zones;
}
