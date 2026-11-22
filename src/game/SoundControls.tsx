import { useSyncExternalStore } from 'react';
import { audio } from './audio';

export function SoundControls() {
  const settings = useSyncExternalStore(audio.subscribe, audio.snapshot);
  return (
    <section className="rounded-2xl bg-purple-950/70 border border-purple-400/20 p-3 text-left w-full max-w-xs pointer-events-auto" aria-label="Configurações de áudio">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-xs uppercase tracking-widest text-purple-200">Som da assombração</span>
        <button className="text-xs text-orange-200 underline underline-offset-2" data-testid="audio-mute"
          aria-pressed={settings.muted} onClick={() => { audio.start(); audio.setMuted(!settings.muted); }}>
          {settings.muted ? 'Ativar som' : 'Silenciar'}
        </button>
      </div>
      {(['music', 'effects'] as const).map(kind => (
        <label key={kind} className="block text-xs text-purple-100 mt-2">
          <span className="flex justify-between"><span>{kind === 'music' ? 'Música' : 'Efeitos sonoros'}</span><span>{Math.round(settings[kind] * 100)}%</span></span>
          <input type="range" min="0" max="100" step="1" value={Math.round(settings[kind] * 100)}
            aria-label={kind === 'music' ? 'Volume da música' : 'Volume dos efeitos sonoros'}
            data-testid={`volume-${kind}`} className="w-full accent-orange-400 h-5 cursor-pointer"
            onChange={e => { audio.start(); audio.setVolume(kind, Number(e.target.value) / 100); }} />
        </label>
      ))}
    </section>
  );
}
