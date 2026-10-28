import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

/** An image attachment, loaded through the API with the login token. */
export function AuthImage({ url, alt, className, onClick }: { url: string; alt: string; className?: string; onClick?: () => void }) {
    const [src, setSrc] = useState<string | null>(null);

    useEffect(() => {
        let objectUrl: string | null = null;
        let active = true;
        api.get(url.replace(/^\/api/, ''), { responseType: 'blob' })
            .then((r) => {
                if (active) {
                    objectUrl = URL.createObjectURL(r.data as Blob);
                    setSrc(objectUrl);
                }
            })
            .catch(() => undefined);

        return () => {
            active = false;
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [url]);

    return src ? <img src={src} alt={alt} className={className} onClick={onClick} /> : <div className={`animate-pulse bg-gray-100 ${className ?? ''}`} />;
}
