import FormatPicker from './FormatPicker';
import { newProject } from './projectCommands';

const LICENSES_URL = `${import.meta.env.BASE_URL}licenses/THIRD-PARTY.txt`;

/** App title, New project, the format picker and the third-party licences link. */
export default function TopBar({ editable, inert }: { editable: boolean; inert: boolean }) {
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
      </div>
      <div className="topbar-group">
        <FormatPicker disabled={!editable} />
        <a className="topbar-link" href={LICENSES_URL} target="_blank" rel="noopener" data-testid="link-licenses">
          Third-party licenses
        </a>
      </div>
    </header>
  );
}
