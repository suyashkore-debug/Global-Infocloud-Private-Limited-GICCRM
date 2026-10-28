import { useEffect, useRef, useState } from 'react';
import { Mic, Square, X } from 'lucide-react';

/** Shared by the staff chat and the customers-area chat. */
export const EMOJIS = '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 😘 😎 🤔 🤗 🙄 😏 😴 😢 😭 😡 😱 🥳 🤝 👍 👎 👏 🙌 🙏 💪 👌 ✌️ 🤞 👋 ✅ ❌ ⚠️ 🔥 ⭐ 🎉 💯 ❤️ 💙 💚 📌 📎 📅 ⏰ 💡 🚀 ☕ 🍰'.split(' ');

export type ChatFile = { id: number; original_name: string; size: number; is_image: boolean; is_audio?: boolean; download_url: string };

export const chatTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export const chatDay = (iso: string) => {
    const d = new Date(iso);
    if (d.toDateString() === new Date().toDateString()) {
        return 'Today';
    }
    if (d.toDateString() === new Date(Date.now() - 86400000).toDateString()) {
        return 'Yesterday';
    }

    return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
};
export const fileSize = (bytes: number) => (bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Text with clickable links (rendered as text, never as HTML). */
export function Linkified({ text }: { text: string }) {
    return (
        <>
            {text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
                /^https?:\/\//.test(part) ? (
                    <a key={i} href={part} target="_blank" rel="noreferrer" className="break-all underline">
                        {part}
                    </a>
                ) : (
                    <span key={i}>{part}</span>
                ),
            )}
        </>
    );
}

/** Runs the callback every few seconds while the browser tab is visible. */
export function usePolling(callback: () => void, ms: number, enabled = true) {
    const saved = useRef(callback);
    saved.current = callback;
    useEffect(() => {
        if (!enabled) {
            return;
        }
        const id = setInterval(() => document.visibilityState === 'visible' && saved.current(), ms);

        return () => clearInterval(id);
    }, [ms, enabled]);
}

/** A voice message: fetched with the login token, then played in the browser's audio player. */
export function AudioPlayer({ load, dark }: { load: () => Promise<Blob>; dark?: boolean }) {
    const [src, setSrc] = useState<string | null>(null);

    useEffect(() => {
        let url: string | null = null;
        let alive = true;
        load()
            .then((blob) => {
                if (alive) {
                    url = URL.createObjectURL(blob);
                    setSrc(url);
                }
            })
            .catch(() => undefined);

        return () => {
            alive = false;
            if (url) {
                URL.revokeObjectURL(url);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return src ? <audio controls src={src} className={`mt-1.5 h-10 w-64 max-w-full ${dark ? 'invert-[0.05]' : ''}`} /> : <div className="mt-1.5 h-10 w-64 animate-pulse rounded-full bg-gray-200/60" />;
}

/**
 * Records a voice message with the microphone. `onRecorded` gets the audio as a file named
 * voice-message-….webm (the server keeps it as audio).
 */
export function VoiceRecorder({ onRecorded, onError }: { onRecorded: (file: File) => void; onError: (message: string) => void }) {
    const [seconds, setSeconds] = useState<number | null>(null);
    const recorder = useRef<MediaRecorder | null>(null);
    const chunks = useRef<Blob[]>([]);
    const cancelled = useRef(false);

    useEffect(() => {
        if (seconds === null) {
            return;
        }
        const id = setInterval(() => setSeconds((s) => (s === null ? s : s + 1)), 1000);

        return () => clearInterval(id);
    }, [seconds === null]); // eslint-disable-line react-hooks/exhaustive-deps

    async function start() {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            onError('Voice messages need a browser with microphone support (and https).');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
            const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
            chunks.current = [];
            cancelled.current = false;
            rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
            rec.onstop = () => {
                stream.getTracks().forEach((t) => t.stop());
                setSeconds(null);
                if (!cancelled.current && chunks.current.length) {
                    const mime = (rec.mimeType || 'audio/webm').split(';')[0];
                    const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm';
                    onRecorded(new File(chunks.current, `voice-message-${Date.now()}.${ext}`, { type: mime }));
                }
            };
            rec.start();
            recorder.current = rec;
            setSeconds(0);
        } catch {
            onError('Microphone access was not allowed.');
        }
    }

    function stop(cancel: boolean) {
        cancelled.current = cancel;
        recorder.current?.stop();
    }

    if (seconds === null) {
        return (
            <button type="button" onClick={start} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" title="Record a voice message">
                <Mic className="h-5 w-5" />
            </button>
        );
    }

    return (
        <span className="flex items-center gap-1.5 rounded-lg bg-red-50 px-2 py-1 text-[13px] font-medium text-red-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" />
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
            <button type="button" onClick={() => stop(false)} className="rounded p-1 hover:bg-red-100" title="Stop and send">
                <Square className="h-4 w-4 fill-current" />
            </button>
            <button type="button" onClick={() => stop(true)} className="rounded p-1 text-gray-500 hover:bg-red-100" title="Cancel">
                <X className="h-4 w-4" />
            </button>
        </span>
    );
}
