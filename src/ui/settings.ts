import type { Game } from '../game/game';
import type { AudioFX } from '../audio/audio';
import { difficulties, type Difficulty } from '../game/rules';
import type { Setting } from './setting-controls';

const difficultyLevels = Object.keys(difficulties) as Difficulty[];
const percent = (value: number) => `${value}%`;

// Each setting owns its domain value and update; controls only know their type.
export function createSettings(game: () => Game, audio: Pick<AudioFX, 'preferences' | 'configure' | 'unlock'>) {
  return {
    gore: {
      id: 'gore', icon: 'gore', label: 'Pulp gore', hint: 'Fatal impacts & blood', type: 'switch',
      read: () => game().settings.gore,
      write: (gore: boolean) => game().configure({ gore }),
    },
    difficulty: {
      id: 'difficulty', icon: 'difficulty', label: 'Difficulty', type: 'slider',
      min: 0, max: difficultyLevels.length - 1, step: 1, stops: difficultyLevels.map((_, index) => index),
      read: () => difficultyLevels.indexOf(game().settings.difficulty),
      write: (level: number) => game().configure({ difficulty: difficultyLevels[level] }),
      format: (level: number) => difficulties[difficultyLevels[level]].name,
    },
    muted: {
      id: 'muted', icon: 'muted', label: 'Mute FX', type: 'switch',
      read: () => audio.preferences.muted,
      write: (muted: boolean) => { audio.configure({ muted }); void audio.unlock(); },
    },
    volume: {
      id: 'volume', icon: 'volume', label: 'FX volume', hint: 'All sound effects', type: 'slider',
      min: 0, max: 100, step: 1, format: percent,
      read: () => Math.round(audio.preferences.volume * 100),
      write: (volume: number) => { audio.configure({ volume: volume / 100 }); void audio.unlock(); },
    },
    playerEngine: {
      id: 'playerEngine', icon: 'volume', label: 'Player engine', type: 'slider',
      min: 0, max: 100, step: 1, format: percent,
      read: () => Math.round(audio.preferences.playerEngine * 100),
      write: (playerEngine: number) => { audio.configure({ playerEngine: playerEngine / 100 }); void audio.unlock(); },
    },
    ambient: {
      id: 'ambient', icon: 'volume', label: 'Ambient', hint: 'Traffic, horns, fire & impacts', type: 'slider',
      min: 0, max: 100, step: 1, format: percent,
      read: () => Math.round(audio.preferences.ambient * 100),
      write: (ambient: number) => { audio.configure({ ambient: ambient / 100 }); void audio.unlock(); },
    },
    sirens: {
      id: 'sirens', icon: 'sirens', label: 'Sirens', type: 'slider',
      min: 0, max: 100, step: 1, format: percent,
      read: () => Math.round(audio.preferences.sirens * 100),
      write: (sirens: number) => { audio.configure({ sirens: sirens / 100 }); void audio.unlock(); },
    },
  } satisfies Record<string, Setting>;
}
export type SettingsControls = ReturnType<typeof createSettings>;
