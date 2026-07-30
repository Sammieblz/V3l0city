import { appConfig } from "@/lib/config";

function AppleMark() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 12.54c-.02-2.14 1.75-3.17 1.83-3.22a3.94 3.94 0 0 0-3.11-1.68c-1.31-.14-2.58.8-3.25.8-.68 0-1.7-.78-2.81-.76a4.11 4.11 0 0 0-3.47 2.1c-1.5 2.59-.38 6.39 1.06 8.5.72 1.03 1.56 2.18 2.66 2.14 1.08-.05 1.49-.69 2.8-.69 1.28 0 1.66.69 2.81.66 1.16-.02 1.89-1.04 2.58-2.08a8.45 8.45 0 0 0 1.18-2.4 3.68 3.68 0 0 1-2.28-3.37Zm-2.14-6.3A3.63 3.63 0 0 0 15.74 3a3.87 3.87 0 0 0-2.5 1.3 3.45 3.45 0 0 0-.85 3.15 3.18 3.18 0 0 0 2.52-1.2Z" /></svg>;
}

function AndroidMark() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7"><path d="m7.3 5.5-1-1.5M16.7 5.5l1-1.5" /><path d="M5.1 10.1c0-3.1 3.1-4.7 6.9-4.7s6.9 1.6 6.9 4.7v7.2a1.7 1.7 0 0 1-1.7 1.7H6.8a1.7 1.7 0 0 1-1.7-1.7v-7.2Z" /><path d="M4 11.2v5.4M20 11.2v5.4M8.1 19v2M15.9 19v2" /><circle cx="9.2" cy="9.2" r=".55" fill="currentColor" stroke="none" /><circle cx="14.8" cy="9.2" r=".55" fill="currentColor" stroke="none" /></svg>;
}

type NativeDownloadsProps = { compact?: boolean };

export function NativeDownloads({ compact = false }: NativeDownloadsProps) {
  return (
    <div className={`native-downloads${compact ? " native-downloads-compact" : ""}`} aria-label="Download the native V3l0city app">
      <a className="store-badge" href={appConfig.iosAppUrl} target="_blank" rel="noreferrer" aria-label="Download V3l0city for iPhone and iPad — placeholder link">
        <AppleMark />
        <span><small>Download for</small><strong>iPhone &amp; iPad</strong></span>
      </a>
      <a className="store-badge" href={appConfig.androidAppUrl} target="_blank" rel="noreferrer" aria-label="Download V3l0city for Android — placeholder link">
        <AndroidMark />
        <span><small>Get it for</small><strong>Android</strong></span>
      </a>
    </div>
  );
}
