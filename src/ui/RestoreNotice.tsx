import { newProject } from './projectCommands';
import { retryRestore, useRestoreFailure } from './session';

/** Persistent notice after a failed restore: the saved project is untouched until the user picks a way out. */
export default function RestoreNotice() {
  const { message, kind } = useRestoreFailure();
  if (message === null) return null;
  return (
    <div className="banner banner-restore" role="alert" data-testid="restore-failed">
      <span>{message}</span>
      <span className="banner-actions">
        <button type="button" data-testid="btn-restore-retry" onClick={() => void retryRestore()}>
          {kind === 'skipped' ? 'Load saved project' : 'Retry loading'}
        </button>
        <button type="button" data-testid="btn-restore-new" onClick={() => void newProject()}>
          Start a new project
        </button>
      </span>
    </div>
  );
}
