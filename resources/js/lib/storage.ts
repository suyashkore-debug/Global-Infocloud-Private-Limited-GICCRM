// localStorage can throw (private mode, blocked site data), so every access is guarded.
export function readStorage(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function writeStorage(key: string, value: string | null): void {
    try {
        if (value === null) {
            window.localStorage.removeItem(key);
        } else {
            window.localStorage.setItem(key, value);
        }
    } catch {
        // Nothing to do: the value just won't survive a reload.
    }
}

const DEVICE_ID_KEY = 'projects_device_id';

/** A stable id for this browser, sent to HRMS with every login. */
export function deviceId(): string {
    let id = readStorage(DEVICE_ID_KEY);
    if (!id) {
        id =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
        writeStorage(DEVICE_ID_KEY, id);
    }

    return id;
}
