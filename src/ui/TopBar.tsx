import type { MouseEvent } from 'react';
import { timelineDuration } from '../core/timeline';
import { useEditor } from '../state/store';
import { openExport } from './exportJob';
import { closeMenu, openMenu, useContextMenu } from './contextMenuStore';
import type { MenuItem } from './contextMenuModel';
import { openHelp } from './helpStore';
import FormatPicker from './FormatPicker';
import { useRecording } from './recordCommands';
import { newProject } from './projectCommands';

const LICENSES_URL = `${import.meta.env.BASE_URL}licenses/THIRD-PARTY.txt`;

const HELP_ITEMS: MenuItem[] = [
  { id: 'help-start', label: 'Getting started', onSelect: () => openHelp('quick-start') },
  { id: 'help-controls', label: 'Controls guide', onSelect: () => openHelp('controls-overview') },
  { id: 'help-shortcuts', label: 'Keyboard shortcuts', onSelect: () => openHelp('shortcuts') },
  { id: 'help-tips', label: 'Tips for editing (right-click, drag, snapping)', onSelect: () => openHelp('tips') },
  'separator',
  { id: 'help-about', label: 'About ClipForge', onSelect: () => openHelp('about') },
  { id: 'licenses', label: 'Third-party licenses', href: LICENSES_URL, testId: 'link-licenses', onSelect: () => {} },
];

function toggleHelpMenu(e: MouseEvent<HTMLButtonElement>): void {
  if (useContextMenu.getState().menu?.owner === 'help') return closeMenu();
  const r = e.currentTarget.getBoundingClientRect();
  openMenu({ at: { x: r.left, y: r.bottom + 2 }, label: 'Help', items: HELP_ITEMS, owner: 'help' });
}

/** App title, New project, the format picker and the third-party licences link. */
export default function TopBar({ editable, inert }: { editable: boolean; inert: boolean }) {
  const hasContent = useEditor((s) => timelineDuration(s.history.present) > 0);
  const recording = useRecording((s) => s.status !== 'idle');
  return (
    <header className="topbar" inert={inert}>
      <div className="topbar-group">
        <h1 className="logo">ClipForge</h1>
        <button
          type="button"
          data-testid="btn-new-project"
          disabled={!editable}
          onClick={() => void newProject()}
          title="Start an empty project"
        >
          New project
        </button>
        <button type="button" data-testid="btn-help" data-menu-trigger="help" aria-haspopup="menu" title="Help, guides and keyboard shortcuts" onClick={toggleHelpMenu}>
          Help
        </button>
      </div>
      <div className="topbar-group">
        <FormatPicker disabled={!editable} />
        <button
          type="button"
          data-testid="btn-export"
          className="btn-primary"
          disabled={!editable || !hasContent || recording}
          onClick={openExport}
          title={recording ? 'Stop the voice-over recording first' : 'Export the timeline as an MP4'}
        >
          Export
        </button>
      </div>
    </header>
  );
}
